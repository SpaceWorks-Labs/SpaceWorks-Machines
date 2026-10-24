import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { can, spaceAllows } from "@/lib/permissionRoles";
import { machineFileUrl } from "@/lib/machines/fileAccess";
import { formatQuantity, poolServesMachine } from "@/lib/consumables/math";
import { scheduleDue, serviceHistory, upkeepSettings, warrantyState } from "@/lib/upkeep";
import { faultNumber } from "@/lib/upkeep/labels";
import { typeWhere } from "@/lib/typeScope";

const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? "";

/** One machine's upkeep: schedules with due state, records, downtime, faults, warranty and history. */
export async function loadMachineUpkeepView({ params }: { params: Promise<{ spaceSlug: string; machineSlug: string }> }) {
  const { spaceSlug, machineSlug } = await params;
  const { space, membership, typeScope } = await requireSpaceCapability(spaceSlug, "maintenance.view");
  const machine = await prisma.machine.findFirst({ where: { spaceId: space.id, slug: machineSlug, ...typeWhere(typeScope) },
    select: { id: true, slug: true, name: true, status: true, retiredAt: true, meterMinutes: true, meterJobs: true, typeId: true } });
  if (!machine) notFound();
  const now = new Date();
  const [profile, settings, schedules, logs, downtime, faults, warranty, pools, history] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, currency: true, timezone: true } }),
    upkeepSettings(prisma, space.id),
    prisma.maintenanceSchedule.findMany({ where: { spaceId: space.id, machineId: machine.id }, orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] }),
    prisma.maintenanceLog.findMany({ where: { spaceId: space.id, machineId: machine.id }, orderBy: { performedAt: "desc" }, take: 30,
      include: { attachments: { select: { id: true, storageKey: true, filename: true } }, schedule: { select: { title: true } } } }),
    prisma.downtime.findMany({ where: { spaceId: space.id, machineId: machine.id }, orderBy: { startedAt: "desc" }, take: 10 }),
    prisma.faultReport.findMany({ where: { spaceId: space.id, machineId: machine.id }, orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, number: true, title: true, severity: true, status: true, createdAt: true } }),
    prisma.warranty.findFirst({ where: { spaceId: space.id, machineId: machine.id }, include: { documents: { select: { id: true, storageKey: true, filename: true } } } }),
    prisma.consumablePool.findMany({ where: { spaceId: space.id, isActive: true }, select: { id: true, material: true, colour: true, brand: true, unit: true, remainingQuantity: true, machineId: true, typeId: true } }),
    serviceHistory(space.id, machine.id, 60),
  ]);
  const role = membership.role;
  const allowed = (capability: Parameters<typeof can>[1]) => can(role, capability) && spaceAllows(space.status, capability);
  return {
    space: { ...space, ...profile }, settings,
    canManage: allowed("maintenance.manage"), canLogUsage: allowed("jobs.operate"), canReport: allowed("machines.view"),
    machine: { id: machine.id, slug: machine.slug, name: machine.name, status: machine.status, retired: machine.retiredAt !== null,
      hours: Math.round(machine.meterMinutes / 6) / 10, jobs: machine.meterJobs },
    schedules: schedules.map((schedule) => ({ id: schedule.id, title: schedule.title, description: schedule.description, checklist: schedule.checklist,
      trigger: schedule.trigger, intervalDays: schedule.intervalDays, intervalHours: schedule.intervalHours, intervalJobs: schedule.intervalJobs,
      blockWhenOverdue: schedule.blockWhenOverdue, isActive: schedule.isActive, lastDoneAt: schedule.lastDoneAt?.toISOString() ?? null,
      due: scheduleDue(schedule, machine, now, settings.maintenanceReminderDays) })),
    logs: logs.map((log) => ({ id: log.id, summary: log.summary, kind: log.kind, details: log.details, partsNote: log.partsNote, vendor: log.vendor,
      cost: log.cost, performedAt: log.performedAt.toISOString(), schedule: log.schedule?.title ?? null,
      attachments: log.attachments.map((file) => ({ id: file.id, filename: file.filename, url: machineFileUrl(file.storageKey) })) })),
    downtime: downtime.map((row) => ({ id: row.id, reason: row.reason, note: row.note, startedAt: row.startedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null })),
    openDowntime: downtime.some((row) => row.endedAt === null),
    faults: faults.map((fault) => ({ ...fault, label: faultNumber(fault.number), createdAt: fault.createdAt.toISOString() })),
    warranty: warranty ? { values: { vendorName: warranty.vendorName, vendorContact: warranty.vendorContact, vendorEmail: warranty.vendorEmail,
      vendorPhone: warranty.vendorPhone, contractNumber: warranty.contractNumber, coverage: warranty.coverage,
      purchasedOn: day(warranty.purchasedOn), startsOn: day(warranty.startsOn), expiresOn: day(warranty.expiresOn) },
      state: warrantyState(warranty.expiresOn, now, settings.warrantyReminderDays),
      documents: warranty.documents.map((file) => ({ id: file.id, filename: file.filename, url: machineFileUrl(file.storageKey) })) } : null,
    pools: pools.filter((pool) => poolServesMachine(pool, machine)).map((pool) => ({ id: pool.id,
      label: `${[pool.brand, pool.material, pool.colour].filter(Boolean).join(" ")} (${formatQuantity(pool.remainingQuantity.toString())} left)` })),
    history,
  };
}
