import "server-only";
import type { MaintenanceKind, MaintenanceTrigger, PayoutMethod, Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { emitWebhook } from "@/lib/webhooks/emit";
import { advanceSchedule } from "./due";
import { assertMachineScope, day, lockMachine, required, text, UpkeepError, UpkeepNotFoundError, type Actor } from "./context";
import { closeOpenDowntime } from "./downtime";
import { postFinance } from "@/lib/finance/post";

export type ScheduleInput = {
  title: string; description?: string; checklist?: string[]; trigger: MaintenanceTrigger;
  intervalDays?: number | null; intervalHours?: number | null; intervalJobs?: number | null;
  firstDueOn?: string | null; blockWhenOverdue?: boolean;
};

const LIMITS = { TIME: ["intervalDays", 3650], USAGE_HOURS: ["intervalHours", 100_000], JOB_COUNT: ["intervalJobs", 100_000] } as const;

function interval(input: ScheduleInput) {
  const [field, max] = LIMITS[input.trigger];
  const value = input[field];
  if (!Number.isInteger(value) || value! < 1 || value! > max) throw new UpkeepError(`Enter an interval between 1 and ${max}.`);
  return { intervalDays: null, intervalHours: null, intervalJobs: null, [field]: value };
}

function fields(input: ScheduleInput) {
  const checklist = (input.checklist ?? []).map((item) => item.trim().slice(0, 200)).filter(Boolean).slice(0, 30);
  return { title: required(input.title, 120, "Give the schedule a title."), description: text(input.description, 2000), checklist,
    trigger: input.trigger, ...interval(input), blockWhenOverdue: input.blockWhenOverdue ?? false };
}

async function lockSchedule(tx: Prisma.TransactionClient, spaceId: string, scheduleId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "MaintenanceSchedule" WHERE "spaceId" = ${spaceId} AND "id" = ${scheduleId} FOR UPDATE`;
  if (!rows[0]) throw new UpkeepNotFoundError();
  return tx.maintenanceSchedule.findUniqueOrThrow({ where: { spaceId_id: { spaceId, id: scheduleId } } });
}

/** Usage schedules start counting from the machine's meters now; time schedules from the first due date. */
export async function createSchedule(tx: Prisma.TransactionClient, actor: Actor & { machineId: string }, input: ScheduleInput) {
  const machine = await lockMachine(tx, actor.spaceId, actor.machineId, actor.actorId);
  const data = fields(input);
  const firstDue = day(input.firstDueOn);
  const schedule = await tx.maintenanceSchedule.create({ data: { ...data, spaceId: actor.spaceId, machineId: machine.id, createdById: actor.actorId,
    nextDueAt: data.trigger === "TIME" ? firstDue ?? new Date(Date.now() + data.intervalDays! * 86_400_000) : null,
    meterMinutesAtLast: machine.meterMinutes, meterJobsAtLast: machine.meterJobs } });
  await recordAuditEvent({ action: "maintenance.schedule_created", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "MaintenanceSchedule", targetId: schedule.id, client: tx });
  return schedule;
}

/** Edits keep the cycle: a new first due date moves a time schedule only when one is given. */
export async function updateSchedule(tx: Prisma.TransactionClient, actor: Actor & { scheduleId: string }, input: ScheduleInput & { isActive: boolean }) {
  const current = await tx.maintenanceSchedule.findFirst({ where: { spaceId: actor.spaceId, id: actor.scheduleId }, select: { machineId: true, trigger: true } });
  if (!current) throw new UpkeepNotFoundError();
  const machine = await lockMachine(tx, actor.spaceId, current.machineId, actor.actorId);
  const schedule = await lockSchedule(tx, actor.spaceId, actor.scheduleId);
  const data = fields(input);
  const firstDue = day(input.firstDueOn);
  const switched = schedule.trigger !== data.trigger;
  const updated = await tx.maintenanceSchedule.update({ where: { spaceId_id: { spaceId: actor.spaceId, id: schedule.id } }, data: { ...data, isActive: input.isActive,
    ...(data.trigger === "TIME" ? (firstDue || switched ? { nextDueAt: firstDue ?? new Date(Date.now() + data.intervalDays! * 86_400_000) } : {}) : { nextDueAt: null }),
    ...(switched ? { meterMinutesAtLast: machine.meterMinutes, meterJobsAtLast: machine.meterJobs, lastNotifiedAt: null } : {}) } });
  await recordAuditEvent({ action: "maintenance.schedule_updated", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "MaintenanceSchedule", targetId: schedule.id, client: tx });
  return updated;
}

export type LogInput = {
  machineId: string; scheduleId?: string | null; faultId?: string | null; kind: MaintenanceKind; summary: string;
  details?: string; partsNote?: string; cost?: number | null; costMethod?: PayoutMethod | null; vendor?: string; performedAt?: Date; restoreIdle?: boolean;
};

/**
 * Append a service record. With a schedule it completes that cycle (advance, reset the reminder); with
 * "restore idle" it closes the machine's open downtime and sets it back to idle.
 */
export async function logMaintenance(tx: Prisma.TransactionClient, actor: Actor, input: LogInput) {
  const machine = await lockMachine(tx, actor.spaceId, input.machineId, actor.actorId);
  const performedAt = input.performedAt ?? new Date();
  if (performedAt.getTime() > Date.now() + 60_000) throw new UpkeepError("The date can't be in the future.");
  if (input.cost != null && (!Number.isInteger(input.cost) || input.cost < 0)) throw new UpkeepError("Enter a cost of zero or more.");
  if (input.faultId && !await tx.faultReport.findFirst({ where: { spaceId: actor.spaceId, id: input.faultId, machineId: machine.id }, select: { id: true } })) throw new UpkeepNotFoundError();
  if (input.scheduleId) {
    const schedule = await lockSchedule(tx, actor.spaceId, input.scheduleId);
    if (schedule.machineId !== machine.id) throw new UpkeepNotFoundError();
    await tx.maintenanceSchedule.update({ where: { spaceId_id: { spaceId: actor.spaceId, id: schedule.id } },
      data: { ...advanceSchedule(schedule, machine, performedAt), lastDoneAt: performedAt, lastNotifiedAt: null } });
  }
  const log = await tx.maintenanceLog.create({ data: { spaceId: actor.spaceId, machineId: machine.id, scheduleId: input.scheduleId ?? null,
    faultId: input.faultId ?? null, kind: input.kind, summary: required(input.summary, 200, "Summarise the work done."),
    details: text(input.details, 5000), partsNote: text(input.partsNote, 2000), cost: input.cost ?? null, costMethod: input.cost ? input.costMethod ?? null : null, vendor: text(input.vendor, 200),
    performedAt, performedById: actor.actorId, meterMinutes: machine.meterMinutes } });
  await recordAuditEvent({ action: "maintenance.logged", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "MaintenanceLog", targetId: log.id, client: tx });
  const ids = await emitWebhook(tx, actor.spaceId, "maintenance.logged", { machineId: machine.id, logId: log.id, scheduleId: log.scheduleId, kind: log.kind });
  if (input.restoreIdle) ids.push(...await closeOpenDowntime(tx, actor, machine, true));
  // A cost is money spent: it posts to the finance ledger with the record.
  if (log.cost) {
    const { currency } = await tx.space.findUniqueOrThrow({ where: { id: actor.spaceId }, select: { currency: true } });
    ids.push(...(await postFinance(tx, { spaceId: actor.spaceId, direction: "OUT", category: "MAINTENANCE", amountMinor: log.cost, currency, method: log.costMethod ?? "OTHER",
      occurredAt: performedAt, sourceType: "MaintenanceLog", sourceId: log.id, actorId: actor.actorId, note: log.summary, supplier: log.vendor,
      machineId: machine.id, typeId: machine.typeId })).webhookDeliveryIds);
  }
  return { log, webhookDeliveryIds: ids };
}

export const MAX_ATTACHMENTS = 10;

export async function addMaintenanceAttachment(tx: Prisma.TransactionClient, actor: Actor, input: { logId: string; storageKey: string; filename: string; contentType: string; sizeBytes: number }) {
  const log = await tx.maintenanceLog.findFirst({ where: { spaceId: actor.spaceId, id: input.logId }, select: { id: true, machineId: true, _count: { select: { attachments: true } } } });
  if (!log) throw new UpkeepNotFoundError();
  await assertMachineScope(tx, actor.spaceId, actor.actorId, log.machineId);
  if (log._count.attachments >= MAX_ATTACHMENTS) throw new UpkeepError(`A record holds up to ${MAX_ATTACHMENTS} attachments.`);
  const row = await tx.maintenanceAttachment.create({ data: { spaceId: actor.spaceId, logId: log.id, storageKey: input.storageKey,
    filename: input.filename, contentType: input.contentType, sizeBytes: input.sizeBytes, uploadedById: actor.actorId } });
  await recordAuditEvent({ action: "maintenance.attachment_added", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "MaintenanceLog", targetId: log.id, client: tx });
  return row;
}
