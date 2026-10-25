import "server-only";
import type { Machine, PrinterConnection, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { transitionJob } from "@/lib/jobs";
import { changeMachineStatus } from "@/lib/machines/machines";
import { recordUsage } from "@/lib/usage/record";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import { adapterFor } from "./adapters";
import { configOf, readPrinterSettings } from "./connections";
import { activeSeconds, readSimState } from "./simulated";
import type { Telemetry } from "./types";

/**
 * Beat (every 15 s on the sync queue): poll each enabled connection that is due, store its telemetry, keep the
 * running job's progress, complete or fail it when the printer finishes (through the job lifecycle, acting as
 * whoever started the job), record ADAPTER usage for runs outside the queue, and mirror idle/printing/paused
 * onto the machine when asked. A failing printer marks its own connection, never the others.
 */
export async function pollPrinters(now = new Date()) {
  const connections = await prisma.printerConnection.findMany({ where: { enabled: true, adapter: { not: "MANUAL" }, machine: { retiredAt: null, space: { status: "ACTIVE" } } }, take: 500 });
  let polled = 0;
  for (const connection of connections) {
    const adapter = adapterFor(connection.adapter);
    const settings = readPrinterSettings(connection.settings);
    if (!adapter.available || (connection.lastSeenAt && now.getTime() - connection.lastSeenAt.getTime() < settings.pollSeconds * 1000 - 500)) continue;
    polled += 1;
    try {
      const { telemetry, simState } = await adapter.getStatus(configOf(connection), now);
      await prisma.printerConnection.update({ where: { id: connection.id }, data: { telemetry: telemetry as Prisma.InputJsonValue, state: "CONNECTED", lastSeenAt: now, lastError: "",
        ...(simState !== undefined ? { simState: simState as Prisma.InputJsonValue } : {}) } });
      await follow({ ...connection, simState: simState ?? connection.simState }, telemetry, settings, now);
    } catch (error) {
      await prisma.printerConnection.update({ where: { id: connection.id }, data: { state: "ERROR", lastSeenAt: now,
        lastError: error instanceof Error ? error.message.slice(0, 300) : "The printer did not answer." } });
    }
  }
  return { polled };
}

async function follow(connection: PrinterConnection, telemetry: Telemetry, settings: ReturnType<typeof readPrinterSettings>, now: Date) {
  const { spaceId, machineId } = connection;
  const job = await prisma.job.findFirst({ where: { spaceId, assignedMachineId: machineId, status: { in: ["RUNNING", "PAUSED"] } } });
  const sim = connection.adapter === "SIMULATED" ? readSimState(connection.simState) : null;
  if (job) {
    if (telemetry.progress !== null && telemetry.progress !== job.progressPercent) await prisma.job.update({ where: { id: job.id }, data: { progressPercent: telemetry.progress } });
    const finished = sim?.phase === "done", failed = telemetry.state === "error" || sim?.phase === "cancelled";
    if (!settings.autoCompleteJobs || !job.startedById || (!finished && !failed)) return;
    const minutes = Math.round((sim ? activeSeconds(sim, now.getTime()) : telemetry.elapsedSeconds ?? 0) / 60);
    const context = { spaceId, actorId: job.startedById, jobId: job.id };
    await transitionJob(context, finished ? { kind: "complete", actualMinutes: minutes }
      : { kind: "fail", reason: telemetry.error ?? "The printer stopped the print.", percent: telemetry.progress ?? 0, actualMinutes: minutes })
      .then(() => prisma.printerCommandLog.create({ data: { spaceId, connectionId: connection.id, command: finished ? "auto-complete" : "auto-fail", jobId: job.id, ok: true, message: "Job updated from the printer." } }))
      .catch((error: unknown) => prisma.printerCommandLog.create({ data: { spaceId, connectionId: connection.id, command: finished ? "auto-complete" : "auto-fail", jobId: job.id, ok: false,
        message: error instanceof Error ? error.message.slice(0, 300) : "Couldn't update the job." } }));
    return;
  }
  // A run started at the printer, outside the queue: record its usage once when it ends.
  if (sim && sim.startedAt && !sim.usageRecorded && ["done", "cancelled", "error"].includes(sim.phase)) {
    const minutes = Math.round(activeSeconds(sim, now.getTime()) / 60);
    const ids = await prisma.$transaction(async (tx) => {
      const { webhookDeliveryIds } = await recordUsage(tx, { spaceId, machineId, source: "ADAPTER", minutes, succeeded: sim.phase === "done",
        note: `Printer run: ${sim.jobName ?? "untitled"}`.slice(0, 200), startedAt: new Date(sim.startedAt!), endedAt: now });
      await tx.printerConnection.update({ where: { id: connection.id }, data: { simState: { ...sim, usageRecorded: true } } });
      return webhookDeliveryIds;
    });
    await enqueueWebhookDeliveries(ids);
  }
  if (settings.syncMachineStatus) await mirrorStatus(spaceId, machineId, telemetry);
}

/** Only between idle, running and paused: maintenance, offline and reserved are staff decisions. */
async function mirrorStatus(spaceId: string, machineId: string, telemetry: Telemetry) {
  const machine: Pick<Machine, "status" | "retiredAt"> | null = await prisma.machine.findFirst({ where: { spaceId, id: machineId }, select: { status: true, retiredAt: true } });
  if (!machine || machine.retiredAt || !["IDLE", "RUNNING", "PAUSED"].includes(machine.status)) return;
  const target = telemetry.state === "printing" ? "RUNNING" : telemetry.state === "paused" ? "PAUSED" : "IDLE";
  if (target === machine.status) return;
  const { webhookDeliveryIds } = await prisma.$transaction((tx) => changeMachineStatus(tx, { spaceId, actorId: null, machineId, status: target, note: "From the printer connection" }));
  await enqueueWebhookDeliveries(webhookDeliveryIds);
}
