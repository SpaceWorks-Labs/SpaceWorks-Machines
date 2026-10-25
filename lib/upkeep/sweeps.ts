import "server-only";
import { prisma } from "@/lib/db";
import { enqueueWebhookDeliveries, emitWebhook } from "@/lib/webhooks/emit";
import { queueUpkeepAlert } from "./alerts";
import { lockMachine, upkeepSettings } from "./context";
import { startDowntime } from "./downtime";
import { scheduleDue, warrantyState } from "./due";

const BATCH = 500;

/**
 * Daily: alert once per due cycle (lastNotifiedAt, cleared when the cycle completes) for schedules that are due
 * soon or overdue, emit maintenance.due, and take overdue blocking machines out of service. Each schedule
 * is its own transaction, so one failure never stops the rest.
 */
export async function runMaintenanceSweep(now = new Date()) {
  const schedules = await prisma.maintenanceSchedule.findMany({
    where: { isActive: true, machine: { retiredAt: null, space: { status: "ACTIVE" } } },
    select: { id: true, spaceId: true, machineId: true }, orderBy: { id: "asc" }, take: BATCH * 20,
  });
  let alerted = 0, blocked = 0;
  for (const { id, spaceId, machineId } of schedules) {
    const result = await prisma.$transaction(async (tx) => {
      const machine = await lockMachine(tx, spaceId, machineId);
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "MaintenanceSchedule" WHERE "spaceId" = ${spaceId} AND "id" = ${id} AND "isActive" FOR UPDATE`;
      if (!rows[0]) return null;
      const schedule = await tx.maintenanceSchedule.findUniqueOrThrow({ where: { spaceId_id: { spaceId, id } } });
      const { maintenanceReminderDays } = await upkeepSettings(tx, spaceId);
      const due = scheduleDue(schedule, machine, now, maintenanceReminderDays);
      const ids: string[] = [];
      let notified = false, block = false;
      if (due.state !== "OK" && !schedule.lastNotifiedAt) {
        await tx.maintenanceSchedule.update({ where: { spaceId_id: { spaceId, id } }, data: { lastNotifiedAt: now } });
        ids.push(...await emitWebhook(tx, spaceId, "maintenance.due", { machineId, scheduleId: id, state: due.state }));
        await queueUpkeepAlert(tx, spaceId, machineId, "maintenance-due", id);
        notified = true;
      }
      if (due.state === "OVERDUE" && schedule.blockWhenOverdue && (machine.status === "IDLE" || machine.status === "RESERVED") &&
        !await tx.downtime.findFirst({ where: { spaceId, machineId, endedAt: null }, select: { id: true } })) {
        ids.push(...(await startDowntime(tx, { spaceId, actorId: null }, { machineId, reason: "PLANNED_MAINTENANCE", note: `Overdue: ${schedule.title}` })).webhookDeliveryIds);
        block = true;
      }
      return { ids, notified, block };
    });
    if (!result) continue;
    await enqueueWebhookDeliveries(result.ids);
    if (result.notified) alerted += 1;
    if (result.block) blocked += 1;
  }
  return { checked: schedules.length, alerted, blocked };
}

/** Daily: one reminder per expiry date (saving a new expiry re-arms it). */
export async function runWarrantySweep(now = new Date()) {
  const warranties = await prisma.warranty.findMany({
    where: { lastNotifiedAt: null, expiresOn: { not: null }, machine: { retiredAt: null, space: { status: "ACTIVE" } } },
    select: { id: true, spaceId: true, machineId: true, expiresOn: true }, take: BATCH * 20,
  });
  let alerted = 0;
  for (const warranty of warranties) {
    const sent = await prisma.$transaction(async (tx) => {
      const { warrantyReminderDays } = await upkeepSettings(tx, warranty.spaceId);
      if (warrantyState(warranty.expiresOn, now, warrantyReminderDays) !== "EXPIRING_SOON") return false;
      // Claim the reminder first; a concurrent sweep that lost the race sends nothing.
      const claimed = await tx.warranty.updateMany({ where: { id: warranty.id, lastNotifiedAt: null }, data: { lastNotifiedAt: now } });
      if (claimed.count === 0) return false;
      await queueUpkeepAlert(tx, warranty.spaceId, warranty.machineId, "warranty-expiring");
      return true;
    });
    if (sent) alerted += 1;
  }
  return { checked: warranties.length, alerted };
}
