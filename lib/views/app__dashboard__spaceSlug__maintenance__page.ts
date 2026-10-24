import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { scheduleDue, upkeepSettings, warrantyState } from "@/lib/upkeep";
import { faultNumber } from "@/lib/upkeep/labels";
import { typeWhere } from "@/lib/typeScope";

/** Upkeep across the space: what needs attention now. Any staff member may read it. */
export async function loadMaintenanceView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const { space, typeScope } = await requireSpaceCapability(spaceSlug, "maintenance.view");
  const machine = typeWhere(typeScope);
  const now = new Date();
  const [profile, settings, schedules, faults, downtime, warranties] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, timezone: true } }),
    upkeepSettings(prisma, space.id),
    prisma.maintenanceSchedule.findMany({ where: { spaceId: space.id, isActive: true, machine: { retiredAt: null, ...machine } },
      include: { machine: { select: { name: true, slug: true, meterMinutes: true, meterJobs: true } } } }),
    prisma.faultReport.findMany({ where: { spaceId: space.id, machine, status: { in: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] } }, orderBy: [{ createdAt: "desc" }], take: 50,
      select: { number: true, title: true, severity: true, status: true, createdAt: true, machine: { select: { name: true } } } }),
    prisma.downtime.findMany({ where: { spaceId: space.id, endedAt: null, machine }, orderBy: { startedAt: "asc" },
      select: { id: true, reason: true, startedAt: true, machine: { select: { name: true, slug: true } } } }),
    prisma.warranty.findMany({ where: { spaceId: space.id, expiresOn: { not: null }, machine: { retiredAt: null, ...machine } }, orderBy: { expiresOn: "asc" },
      select: { expiresOn: true, vendorName: true, machine: { select: { name: true, slug: true } } } }),
  ]);
  const attention = schedules.map((schedule) => ({ id: schedule.id, title: schedule.title, machine: schedule.machine.name, machineSlug: schedule.machine.slug,
    due: scheduleDue(schedule, schedule.machine, now, settings.maintenanceReminderDays) })).filter((row) => row.due.state !== "OK")
    .sort((a, b) => (a.due.state === "OVERDUE" ? 0 : 1) - (b.due.state === "OVERDUE" ? 0 : 1) || (a.due.remaining ?? 0) - (b.due.remaining ?? 0));
  const expiring = warranties.map((row) => ({ machine: row.machine.name, machineSlug: row.machine.slug, vendor: row.vendorName,
    expiresOn: row.expiresOn!.toISOString().slice(0, 10), state: warrantyState(row.expiresOn, now, settings.warrantyReminderDays) }))
    .filter((row) => row.state === "EXPIRING_SOON" || row.state === "EXPIRED");
  return {
    space: { ...space, ...profile },
    counts: { overdue: attention.filter((row) => row.due.state === "OVERDUE").length, dueSoon: attention.filter((row) => row.due.state === "DUE_SOON").length,
      faults: faults.length, down: downtime.length },
    attention, expiring,
    faults: faults.map((fault) => ({ ...fault, label: faultNumber(fault.number), machine: fault.machine.name, createdAt: fault.createdAt.toISOString() })),
    downtime: downtime.map((row) => ({ id: row.id, reason: row.reason, startedAt: row.startedAt.toISOString(), machine: row.machine.name, machineSlug: row.machine.slug })),
  };
}
