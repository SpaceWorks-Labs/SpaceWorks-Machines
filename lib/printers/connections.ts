import "server-only";
import { Prisma, type PrinterAdapterKind, type PrinterConnection } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordSettingsChange } from "@/lib/audit";
import { decryptSpaceSecret, encryptSpaceSecret } from "@/lib/spaceSecrets";
import { adapterFor } from "./adapters";
import { injectError } from "./simulated";
import type { CommandResult, ConnectionConfig } from "./types";
import { actorMayUseMachine } from "@/lib/typeScope";

export class PrinterError extends Error {}
export type PrinterSettings = { pollSeconds: number; syncMachineStatus: boolean; autoCompleteJobs: boolean };
export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = { pollSeconds: 15, syncMachineStatus: true, autoCompleteJobs: true };

export function readPrinterSettings(value: unknown): PrinterSettings {
  const s = (value && typeof value === "object" ? value : {}) as Partial<PrinterSettings>;
  return { pollSeconds: Number.isInteger(s.pollSeconds) && s.pollSeconds! >= 15 && s.pollSeconds! <= 3600 ? s.pollSeconds! : DEFAULT_PRINTER_SETTINGS.pollSeconds,
    syncMachineStatus: s.syncMachineStatus ?? DEFAULT_PRINTER_SETTINGS.syncMachineStatus, autoCompleteJobs: s.autoCompleteJobs ?? DEFAULT_PRINTER_SETTINGS.autoCompleteJobs };
}

export function configOf(connection: Pick<PrinterConnection, "spaceId" | "baseUrl" | "deviceId" | "secretEncrypted" | "simState">): ConnectionConfig {
  return { baseUrl: connection.baseUrl, deviceId: connection.deviceId, simState: connection.simState,
    secret: connection.secretEncrypted ? decryptSpaceSecret(connection.secretEncrypted, connection.spaceId, "printer") : null };
}

/** One connection per machine. The secret is write-only: blank keeps the saved one. "Coming soon" adapters can't be chosen. */
export async function saveConnection(tx: Prisma.TransactionClient, actor: { spaceId: string; actorId: string }, input: {
  machineId: string; adapter: PrinterAdapterKind; enabled: boolean; baseUrl?: string; deviceId?: string; secret?: string; settings: Partial<PrinterSettings>;
}) {
  const machine = await tx.machine.findFirst({ where: { spaceId: actor.spaceId, id: input.machineId }, select: { id: true } });
  if (!machine || !(await actorMayUseMachine(tx, actor.spaceId, actor.actorId, machine.id))) throw new PrinterError("Space not found.");
  if (!adapterFor(input.adapter).available) throw new PrinterError("That connection type is coming soon.");
  const current = await tx.printerConnection.findUnique({ where: { spaceId_machineId: { spaceId: actor.spaceId, machineId: machine.id } } });
  const settings = readPrinterSettings({ ...readPrinterSettings(current?.settings), ...input.settings });
  const data = { adapter: input.adapter, enabled: input.enabled, baseUrl: (input.baseUrl ?? "").trim().slice(0, 300), deviceId: (input.deviceId ?? "").trim().slice(0, 120),
    settings, ...(input.secret ? { secretEncrypted: encryptSpaceSecret(input.secret, actor.spaceId, "printer") } : {}),
    ...(current?.adapter !== input.adapter ? { simState: Prisma.DbNull, telemetry: Prisma.DbNull, state: "UNCONFIGURED" as const, lastError: "" } : {}) };
  const connection = await tx.printerConnection.upsert({ where: { spaceId_machineId: { spaceId: actor.spaceId, machineId: machine.id } },
    create: { ...data, spaceId: actor.spaceId, machineId: machine.id }, update: data });
  await recordSettingsChange({ spaceId: actor.spaceId, actorUserId: actor.actorId, area: "machine.printers", targetType: "PrinterConnection", targetId: connection.id, client: tx,
    before: { adapter: current?.adapter ?? null, enabled: current?.enabled ?? null, baseUrl: current?.baseUrl ?? null, deviceId: current?.deviceId ?? null, ...readPrinterSettings(current?.settings) },
    after: { adapter: data.adapter, enabled: data.enabled, baseUrl: data.baseUrl, deviceId: data.deviceId, ...settings } });
  if (input.secret) await recordSettingsChange({ spaceId: actor.spaceId, actorUserId: actor.actorId, area: "machine.printers", fields: ["secret"], targetType: "PrinterConnection", targetId: connection.id, client: tx });
  return connection;
}

export type PrinterCommand = "test" | "start" | "pause" | "resume" | "cancel" | "fail";

/** Run one command against a connection, store the simulator state it returns, and log it. */
export async function runPrinterCommand(spaceId: string, connectionId: string, command: PrinterCommand, actorId: string | null,
  options: { jobId?: string; name?: string; estimatedSeconds?: number } = {}, now = new Date()): Promise<CommandResult> {
  const connection = await prisma.printerConnection.findFirst({ where: { spaceId, id: connectionId } });
  if (!connection || !(await actorMayUseMachine(prisma, spaceId, actorId, connection.machineId))) throw new PrinterError("Space not found.");
  const adapter = adapterFor(connection.adapter);
  const config = configOf(connection);
  let result: CommandResult;
  try {
    result = command === "test" ? await adapter.testConnection(config)
      : command === "start" ? await adapter.startJob(config, { name: options.name ?? "Run", estimatedSeconds: options.estimatedSeconds ?? 1200 }, now)
        : command === "pause" ? await adapter.pauseJob(config, now) : command === "resume" ? await adapter.resumeJob(config, now)
          : command === "cancel" ? await adapter.cancelJob(config, now)
            : connection.adapter === "SIMULATED" ? injectError(connection.simState, now.getTime()) : { ok: false, message: "Only the simulated printer can fail on purpose." };
  } catch (error) {
    result = { ok: false, message: error instanceof Error ? error.message.slice(0, 300) : "The printer did not answer." };
  }
  // A run started for a job records its usage through the job, never again as an adapter run.
  if (command === "start" && options.jobId && result.simState && typeof result.simState === "object") result.simState = { ...result.simState, usageRecorded: true };
  await prisma.$transaction([
    ...(result.simState !== undefined ? [prisma.printerConnection.update({ where: { id: connection.id }, data: { simState: result.simState as Prisma.InputJsonValue } })] : []),
    prisma.printerCommandLog.create({ data: { spaceId, connectionId: connection.id, command, jobId: options.jobId, ok: result.ok, message: result.message.slice(0, 500), actorId } }),
  ]);
  return result;
}
