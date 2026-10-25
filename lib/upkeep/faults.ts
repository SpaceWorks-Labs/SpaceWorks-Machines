import "server-only";
import type { FaultSeverity, FaultStatus, Prisma, SpaceRole } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { CAPABILITIES, type Capability } from "@/lib/permissionRoles";
import { rolesForType } from "@/lib/typeScope";
import { emitWebhook } from "@/lib/webhooks/emit";
import { queueUpkeepAlert } from "./alerts";
import { assertMachineScope, lockMachine, required, text, UpkeepError, UpkeepNotFoundError, type Actor } from "./context";
import { startDowntime } from "./downtime";
import { closeRequestsForFault } from "@/lib/repairs/requests";

export const MAX_FAULT_PHOTOS = 4;
export const MAX_FIX_PHOTOS = 6;
const CLOSED: FaultStatus[] = ["RESOLVED", "WONT_FIX"];
/** Forward-only workflow; closing is allowed from any open state. */
const NEXT: Record<FaultStatus, FaultStatus[]> = {
  OPEN: ["ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "WONT_FIX"],
  ACKNOWLEDGED: ["IN_PROGRESS", "RESOLVED", "WONT_FIX"],
  IN_PROGRESS: ["RESOLVED", "WONT_FIX"],
  // Set by the technician (lib/repairs/fix.ts); a manager closes it or reopens it.
  FIXED: ["RESOLVED", "IN_PROGRESS", "WONT_FIX"],
  RESOLVED: [], WONT_FIX: [],
};

async function nextFaultNumber(tx: Prisma.TransactionClient, spaceId: string) {
  return (await tx.spaceCounter.upsert({ where: { spaceId_key: { spaceId, key: "fault" } },
    create: { spaceId, key: "fault", value: 1 }, update: { value: { increment: 1 } } })).value;
}

/**
 * A maker or staff member reports a problem. `takeOffline` (staff only, decided by the caller) is honoured
 * for HIGH and CRITICAL faults: it opens a FAULT downtime and takes the machine offline.
 */
export async function reportFault(tx: Prisma.TransactionClient, actor: Actor, input: {
  machineId: string; severity: FaultSeverity; title: string; description?: string; jobId?: string | null; takeOffline?: boolean;
}) {
  const machine = await lockMachine(tx, actor.spaceId, input.machineId, actor.actorId);
  if (machine.retiredAt) throw new UpkeepNotFoundError();
  if (input.jobId && !await tx.job.findFirst({ where: { spaceId: actor.spaceId, id: input.jobId }, select: { id: true } })) throw new UpkeepNotFoundError();
  const fault = await tx.faultReport.create({ data: { spaceId: actor.spaceId, machineId: machine.id, number: await nextFaultNumber(tx, actor.spaceId),
    reportedById: actor.actorId, jobId: input.jobId ?? null, severity: input.severity,
    title: required(input.title, 120, "Say what's wrong in a few words."), description: text(input.description, 5000) } });
  await recordAuditEvent({ action: "fault.reported", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "FaultReport", targetId: fault.id, metadata: { severity: fault.severity }, client: tx });
  const ids = await emitWebhook(tx, actor.spaceId, "fault.reported", { machineId: machine.id, faultId: fault.id, severity: fault.severity });
  await queueUpkeepAlert(tx, actor.spaceId, machine.id, "fault-reported", fault.id);
  const serious = fault.severity === "HIGH" || fault.severity === "CRITICAL";
  if (input.takeOffline && serious && machine.status !== "RUNNING" && machine.status !== "PAUSED" &&
    !await tx.downtime.findFirst({ where: { spaceId: actor.spaceId, machineId: machine.id, endedAt: null }, select: { id: true } })) {
    ids.push(...(await startDowntime(tx, actor, { machineId: machine.id, reason: "FAULT", faultId: fault.id, status: "OFFLINE", note: fault.title })).webhookDeliveryIds);
  }
  return { fault, webhookDeliveryIds: ids };
}

async function assignable(tx: Prisma.TransactionClient, spaceId: string, userId: string, machineId: string) {
  const machine = await tx.machine.findUniqueOrThrow({ where: { spaceId_id: { spaceId, id: machineId } }, select: { typeId: true } });
  return await tx.spaceMember.count({ where: { spaceId, userId, status: "ACTIVE",
    ...rolesForType(CAPABILITIES["maintenance.manage" satisfies Capability] as readonly SpaceRole[], machine.typeId) } }) > 0;
}

export async function updateFault(tx: Prisma.TransactionClient, actor: Actor, input: {
  faultId: string; status?: FaultStatus; assignedToId?: string | null; resolution?: string;
}) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FaultReport" WHERE "spaceId" = ${actor.spaceId} AND "id" = ${input.faultId} FOR UPDATE`;
  if (!rows[0]) throw new UpkeepNotFoundError();
  const fault = await tx.faultReport.findUniqueOrThrow({ where: { spaceId_id: { spaceId: actor.spaceId, id: input.faultId } } });
  await assertMachineScope(tx, actor.spaceId, actor.actorId, fault.machineId);
  if (CLOSED.includes(fault.status)) throw new UpkeepError("This fault is closed.");
  const data: Prisma.FaultReportUncheckedUpdateInput = {};
  if (input.assignedToId !== undefined) {
    if (input.assignedToId && !await assignable(tx, actor.spaceId, input.assignedToId, fault.machineId)) throw new UpkeepError("Assign someone who manages maintenance in this space.");
    data.assignedToId = input.assignedToId;
  }
  const status = input.status && input.status !== fault.status ? input.status : null;
  if (status && !NEXT[fault.status].includes(status)) throw new UpkeepError("That status change isn't allowed.");
  if (status) data.status = status;
  const closing = status !== null && CLOSED.includes(status);
  if (closing) {
    data.resolution = required(input.resolution, 2000, "Say how the fault was resolved, or why it won't be fixed.");
    data.resolvedAt = new Date(); data.resolvedById = actor.actorId;
  } else if (input.resolution !== undefined) data.resolution = text(input.resolution, 2000);
  const updated = await tx.faultReport.update({ where: { spaceId_id: { spaceId: actor.spaceId, id: fault.id } }, data });
  await recordAuditEvent({ action: closing ? "fault.resolved" : "fault.updated", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "FaultReport", targetId: fault.id,
    metadata: { status: updated.status, assigned: updated.assignedToId !== null }, client: tx });
  const ids: string[] = [];
  if (closing) {
    await closeRequestsForFault(tx, actor.spaceId, fault.id);
    ids.push(...await emitWebhook(tx, actor.spaceId, "fault.resolved", { machineId: fault.machineId, faultId: fault.id, status: updated.status }));
    await queueUpkeepAlert(tx, actor.spaceId, fault.machineId, "fault-resolved", fault.id);
  }
  return { fault: updated, webhookDeliveryIds: ids };
}

/** Report photos, or (stage FIX, from the technician who took the repair) photos of the fix. */
export async function addFaultPhoto(tx: Prisma.TransactionClient, actor: Actor, input: { faultId: string; storageKey: string; stage?: "REPORT" | "FIX" }) {
  const fault = await tx.faultReport.findFirst({ where: { spaceId: actor.spaceId, id: input.faultId },
    select: { id: true, machineId: true, reportedById: true, technician: { select: { userId: true } } } });
  if (!fault) throw new UpkeepNotFoundError();
  if (fault.reportedById !== actor.actorId) await assertMachineScope(tx, actor.spaceId, actor.actorId, fault.machineId);
  const stage = input.stage ?? (actor.actorId && fault.technician?.userId === actor.actorId ? "FIX" : "REPORT");
  const max = stage === "FIX" ? MAX_FIX_PHOTOS : MAX_FAULT_PHOTOS;
  const label = stage === "FIX" ? "repair" : "fault";
  if (await tx.faultPhoto.count({ where: { spaceId: actor.spaceId, faultId: fault.id, stage } }) >= max) throw new UpkeepError(`A ${label} holds up to ${max} photos.`);
  return tx.faultPhoto.create({ data: { spaceId: actor.spaceId, faultId: fault.id, storageKey: input.storageKey, stage } });
}
