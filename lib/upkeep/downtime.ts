import "server-only";
import type { DowntimeReason, Machine, Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { emitWebhook } from "@/lib/webhooks/emit";
import { lockMachine, setStatus, text, UpkeepError, UpkeepNotFoundError, type Actor } from "./context";

/** Busy machines finish or fail their job first: downtime never strands a running job. */
function assertNotBusy(machine: Machine) {
  if (machine.status === "RUNNING" || machine.status === "PAUSED") throw new UpkeepError("Finish or fail the machine's running job first.");
}

/** Open a downtime window: the machine goes to maintenance (or offline) until it ends. One open window at a time. */
export async function startDowntime(tx: Prisma.TransactionClient, actor: Actor, input: {
  machineId: string; reason: DowntimeReason; note?: string; faultId?: string | null; status?: "MAINTENANCE" | "OFFLINE";
}) {
  const machine = await lockMachine(tx, actor.spaceId, input.machineId, actor.actorId);
  if (machine.retiredAt) throw new UpkeepError("A retired machine is already out of service.");
  assertNotBusy(machine);
  if (await tx.downtime.findFirst({ where: { spaceId: actor.spaceId, machineId: machine.id, endedAt: null }, select: { id: true } })) {
    throw new UpkeepError("This machine already has open downtime. End it first.");
  }
  if (input.faultId && !await tx.faultReport.findFirst({ where: { spaceId: actor.spaceId, id: input.faultId, machineId: machine.id }, select: { id: true } })) throw new UpkeepNotFoundError();
  const downtime = await tx.downtime.create({ data: { spaceId: actor.spaceId, machineId: machine.id, reason: input.reason,
    note: text(input.note, 2000), faultId: input.faultId ?? null, startedById: actor.actorId } });
  const status = input.status ?? "MAINTENANCE";
  const ids = await setStatus(tx, actor, machine, status, `Downtime: ${input.reason.toLowerCase().replaceAll("_", " ")}`);
  await recordAuditEvent({ action: "downtime.started", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "Downtime", targetId: downtime.id, metadata: { reason: input.reason }, client: tx });
  ids.push(...await emitWebhook(tx, actor.spaceId, "downtime.started", { machineId: machine.id, downtimeId: downtime.id, reason: input.reason }));
  return { downtime, webhookDeliveryIds: ids };
}

/** Close the machine's open window (if any); the machine returns to idle when asked. */
export async function closeOpenDowntime(tx: Prisma.TransactionClient, actor: Actor, machine: Machine, restoreIdle: boolean) {
  const open = await tx.downtime.findFirst({ where: { spaceId: actor.spaceId, machineId: machine.id, endedAt: null } });
  const ids: string[] = [];
  if (open) {
    await tx.downtime.update({ where: { id: open.id }, data: { endedAt: new Date(), endedById: actor.actorId } });
    await recordAuditEvent({ action: "downtime.ended", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "Downtime", targetId: open.id, client: tx });
    ids.push(...await emitWebhook(tx, actor.spaceId, "downtime.ended", { machineId: machine.id, downtimeId: open.id }));
  }
  if (restoreIdle && (machine.status === "MAINTENANCE" || machine.status === "OFFLINE")) ids.push(...await setStatus(tx, actor, machine, "IDLE", "Back in service"));
  return ids;
}

export async function endDowntime(tx: Prisma.TransactionClient, actor: Actor, input: { machineId: string }) {
  const machine = await lockMachine(tx, actor.spaceId, input.machineId, actor.actorId);
  if (!await tx.downtime.findFirst({ where: { spaceId: actor.spaceId, machineId: machine.id, endedAt: null }, select: { id: true } })) {
    throw new UpkeepError("This machine has no open downtime.");
  }
  return { webhookDeliveryIds: await closeOpenDowntime(tx, actor, machine, true) };
}
