import "server-only";

import type { MachineStatus, Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { emitWebhook } from "@/lib/webhooks/emit";
import { readFields, validateSpecs } from "./fields";
import { freeSlug, TypeNotFoundError } from "./types";
import { actorMayUseType } from "@/lib/typeScope";

export class MachineNotFoundError extends Error {
  constructor() {
    super("Machine not found.");
  }
}

export class MachineInputError extends Error {
  constructor(readonly fieldErrors: Record<string, string[]>) {
    super("Check the highlighted fields.");
  }
}

export type MachineDetails = {
  name: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  location: string;
  description: string;
  notes: string;
  firmwareVersion: string;
  acquiredOn: Date | null;
  /** Undefined keeps the stored cost (roles without finance never see or send it). */
  purchaseCost: number | null | undefined;
  specs: Record<string, unknown>;
};

function specErrors(errors: Record<string, string>) {
  return Object.fromEntries(Object.entries(errors).map(([key, message]) => [`specs.${key}`, [message]]));
}

/** A machine of one type (fixed from now on). Specs are checked against the type's spec fields. */
export async function createMachine(tx: Prisma.TransactionClient, input: MachineDetails & { spaceId: string; actorId: string; typeId: string; isPublic: boolean; acceptsJobs: boolean }) {
  const type = await tx.machineType.findFirst({ where: { id: input.typeId, spaceId: input.spaceId }, select: { id: true, specFields: true, archivedAt: true } });
  if (!type || !(await actorMayUseType(tx, input.spaceId, input.actorId, type.id))) throw new TypeNotFoundError();
  if (type.archivedAt) throw new MachineInputError({ typeId: ["Choose a machine type"] });
  const specs = validateSpecs(readFields(type.specFields), input.specs);
  if (!specs.ok) throw new MachineInputError(specErrors(specs.errors));
  const slug = await freeSlug(tx, "machine", input.spaceId, input.name);
  const machine = await tx.machine.create({
    data: {
      spaceId: input.spaceId, typeId: type.id, slug, name: input.name, manufacturer: input.manufacturer, model: input.model,
      serialNumber: input.serialNumber, location: input.location, description: input.description, notes: input.notes,
      firmwareVersion: input.firmwareVersion, acquiredOn: input.acquiredOn, purchaseCost: input.purchaseCost,
      specs: specs.values as Prisma.InputJsonValue, isPublic: input.isPublic, acceptsJobs: input.acceptsJobs, createdById: input.actorId,
    },
    select: { id: true, slug: true },
  });
  await recordAuditEvent({ action: "machine.created", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "Machine", targetId: machine.id, client: tx });
  const webhookDeliveryIds = await emitWebhook(tx, input.spaceId, "machine.created", { machineId: machine.id, typeId: type.id, slug: machine.slug });
  return { ...machine, missingSpecs: specs.missing, webhookDeliveryIds };
}

/** Edit a machine's details and specs. The type never changes; stored specs the type no longer defines are kept. */
export async function updateMachine(tx: Prisma.TransactionClient, input: MachineDetails & { spaceId: string; actorId: string; machineId: string }) {
  const machine = await tx.machine.findFirst({ where: { id: input.machineId, spaceId: input.spaceId }, select: { id: true, specs: true, typeId: true, type: { select: { specFields: true } } } });
  if (!machine || !(await actorMayUseType(tx, input.spaceId, input.actorId, machine.typeId))) throw new MachineNotFoundError();
  const stored = machine.specs && typeof machine.specs === "object" && !Array.isArray(machine.specs) ? (machine.specs as Record<string, unknown>) : {};
  const specs = validateSpecs(readFields(machine.type.specFields), input.specs, stored);
  if (!specs.ok) throw new MachineInputError(specErrors(specs.errors));
  await tx.machine.update({
    where: { spaceId_id: { spaceId: input.spaceId, id: machine.id } },
    data: {
      name: input.name, manufacturer: input.manufacturer, model: input.model, serialNumber: input.serialNumber, location: input.location,
      description: input.description, notes: input.notes, firmwareVersion: input.firmwareVersion, acquiredOn: input.acquiredOn,
      purchaseCost: input.purchaseCost, specs: specs.values as Prisma.InputJsonValue,
    },
  });
  await recordAuditEvent({ action: "machine.updated", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "Machine", targetId: machine.id, client: tx });
  const webhookDeliveryIds = await emitWebhook(tx, input.spaceId, "machine.updated", { machineId: machine.id });
  return { missingSpecs: specs.missing, webhookDeliveryIds };
}

/** Row-lock a machine; a machine-type manager outside the machine's type gets the same not-found. */
async function lockMachine(tx: Prisma.TransactionClient, spaceId: string, machineId: string, actorId: string | null) {
  const rows = await tx.$queryRaw<Array<{ id: string; status: MachineStatus; statusNote: string; retiredAt: Date | null; typeId: string }>>`
    SELECT "id", "status", "statusNote", "retiredAt", "typeId" FROM "Machine" WHERE "id" = ${machineId} AND "spaceId" = ${spaceId} FOR UPDATE`;
  if (!rows[0] || !(await actorMayUseType(tx, spaceId, actorId, rows[0].typeId))) throw new MachineNotFoundError();
  return rows[0];
}

/** A status change with an optional note: audited and announced as `machine.status_changed`. */
export async function changeMachineStatus(tx: Prisma.TransactionClient, input: { spaceId: string; actorId: string | null; machineId: string; status: MachineStatus; note: string; jobId?: string }) {
  const machine = await lockMachine(tx, input.spaceId, input.machineId, input.actorId);
  if (machine.retiredAt) throw new MachineInputError({ status: ["A retired machine stays offline. Bring it back into service first."] });
  if (machine.status === input.status) {
    if (machine.statusNote !== input.note) {
      await tx.machine.update({ where: { spaceId_id: { spaceId: input.spaceId, id: machine.id } }, data: { statusNote: input.note } });
      await recordAuditEvent({ action: "machine.updated", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "Machine", targetId: machine.id, client: tx });
    }
    return { changed: false, webhookDeliveryIds: [] as string[] };
  }
  // The machine lock also serialises job starts. Only the owning job's lifecycle may move a busy
  // machine: manual edits, upkeep and a stale printer poll must not strand its job or release it.
  const activeJob = await tx.job.findFirst({ where: { spaceId: input.spaceId, assignedMachineId: machine.id,
    status: { in: ["RUNNING", "PAUSED"] } }, select: { id: true } });
  if (activeJob && activeJob.id !== input.jobId) throw new MachineInputError({ status: ["Finish, fail or cancel the machine's active job first."] });
  if (["IDLE", "RESERVED", "RUNNING", "PAUSED"].includes(input.status) && await tx.downtime.findFirst({
    where: { spaceId: input.spaceId, machineId: machine.id, endedAt: null }, select: { id: true },
  })) throw new MachineInputError({ status: ["End the machine's downtime before returning it to service."] });
  await tx.machine.update({ where: { spaceId_id: { spaceId: input.spaceId, id: machine.id } }, data: { status: input.status, statusNote: input.note } });
  await recordAuditEvent({ action: "machine.status_changed", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "Machine", targetId: machine.id, metadata: { from: machine.status, to: input.status }, client: tx });
  const webhookDeliveryIds = await emitWebhook(tx, input.spaceId, "machine.status_changed", { machineId: machine.id, from: machine.status, to: input.status });
  return { changed: true, webhookDeliveryIds };
}

/** Retire (out of service: offline, off queues and public pages) or bring back (idle again). */
export async function setMachineRetired(tx: Prisma.TransactionClient, input: { spaceId: string; actorId: string; machineId: string; retired: boolean }) {
  const machine = await lockMachine(tx, input.spaceId, input.machineId, input.actorId);
  if ((machine.retiredAt !== null) === input.retired) return { webhookDeliveryIds: [] as string[] };
  if (input.retired && (["RUNNING", "PAUSED"].includes(machine.status) || await tx.job.findFirst({
    where: { spaceId: input.spaceId, assignedMachineId: machine.id, status: { in: ["RUNNING", "PAUSED"] } }, select: { id: true },
  }))) throw new MachineInputError({ _root: ["Finish, fail or cancel the machine's active job before retiring it."] });
  if (!input.retired && await tx.downtime.findFirst({ where: { spaceId: input.spaceId, machineId: machine.id, endedAt: null }, select: { id: true } })) {
    throw new MachineInputError({ _root: ["End the machine's downtime before returning it to service."] });
  }
  await tx.machine.update({
    where: { spaceId_id: { spaceId: input.spaceId, id: machine.id } },
    data: input.retired ? { retiredAt: new Date(), status: "OFFLINE", isPublic: false, acceptsJobs: false } : { retiredAt: null, status: "IDLE", statusNote: "" },
  });
  await recordAuditEvent({ action: input.retired ? "machine.retired" : "machine.unretired", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "Machine", targetId: machine.id, client: tx });
  const ids = input.retired
    ? await emitWebhook(tx, input.spaceId, "machine.retired", { machineId: machine.id })
    : await emitWebhook(tx, input.spaceId, "machine.status_changed", { machineId: machine.id, from: machine.status, to: "IDLE" });
  return { webhookDeliveryIds: ids };
}

/** Public listing and job intake switches. A retired machine can't be made public or take jobs. */
export async function setMachineFlags(tx: Prisma.TransactionClient, input: { spaceId: string; actorId: string; machineId: string; isPublic?: boolean; acceptsJobs?: boolean }) {
  const machine = await lockMachine(tx, input.spaceId, input.machineId, input.actorId);
  if (machine.retiredAt && (input.isPublic || input.acceptsJobs)) throw new MachineInputError({ _root: ["Bring the machine back into service first."] });
  const data = { ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}), ...(input.acceptsJobs !== undefined ? { acceptsJobs: input.acceptsJobs } : {}) };
  await tx.machine.update({ where: { spaceId_id: { spaceId: input.spaceId, id: machine.id } }, data });
  await recordAuditEvent({ action: "machine.flags_changed", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "Machine", targetId: machine.id, metadata: data, client: tx });
  return { webhookDeliveryIds: await emitWebhook(tx, input.spaceId, "machine.updated", { machineId: machine.id, ...data }) };
}
