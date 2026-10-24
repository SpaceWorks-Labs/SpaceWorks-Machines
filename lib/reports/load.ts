import "server-only";
import { prisma } from "@/lib/db";
import { machineTypeWhere, typeWhere, type TypeScope } from "@/lib/typeScope";
import { scheduleDue, warrantyState } from "@/lib/upkeep/due";
import { consumablesReport, jobsReport, maintenanceReport, revenueReport, utilisationReport } from "./compute";

export { REPORT_KINDS, reportRange, type ReportKind } from "./range";

/**
 * Every report for one space over [from, to). Rows are loaded once and shared between the reports. A machine type
 * manager's reports cover only their types (consumables: pools tied to one of those types or their machines).
 */
export async function loadReports(spaceId: string, from: Date, to: Date, scope: TypeScope = null, now = new Date()) {
  const inRange = { gte: from, lt: to };
  const byType = typeWhere(scope), byMachine = machineTypeWhere(scope);
  const byPool = scope === null ? {} : { pool: { OR: [{ typeId: { in: scope } }, { machine: { typeId: { in: scope } } }] } };
  const byJob = scope === null ? {} : { job: { typeId: { in: scope } } };
  const overlaps = { startedAt: { lt: to }, OR: [{ endedAt: null }, { endedAt: { gte: from } }] };
  const [machines, jobs, usage, downtime, faults, adjustments, payments, refunds, logs, schedules, warranties, settings] = await Promise.all([
    prisma.machine.findMany({ where: { spaceId, retiredAt: null, ...byType }, orderBy: { name: "asc" }, select: { id: true, name: true, meterMinutes: true, meterJobs: true } }),
    prisma.job.findMany({ where: { spaceId, submittedAt: inRange, ...byType }, select: { status: true, submittedAt: true, completedAt: true, type: { select: { name: true } }, assignedMachine: { select: { name: true } } } }),
    prisma.usageLog.findMany({ where: { spaceId, createdAt: inRange, ...byMachine }, select: { machineId: true, minutes: true } }),
    prisma.downtime.findMany({ where: { spaceId, ...overlaps, ...byMachine }, select: { machineId: true, startedAt: true, endedAt: true, faultId: true } }),
    prisma.faultReport.findMany({ where: { spaceId, createdAt: inRange, ...byMachine }, select: { machineId: true, createdAt: true } }),
    prisma.consumableAdjustment.findMany({ where: { spaceId, createdAt: inRange, ...byPool }, select: { kind: true, delta: true, pool: { select: { material: true, colour: true, brand: true, unit: true, costPerUnit: true } } } }),
    prisma.payment.findMany({ where: { spaceId, ...byJob, OR: [{ paidAt: inRange }, { status: { in: ["PENDING", "WAIVED"] }, createdAt: inRange }] },
      select: { currency: true, status: true, method: true, amount: true, job: { select: { type: { select: { name: true } }, assignedMachine: { select: { name: true } } } } } }),
    prisma.refund.findMany({ where: { spaceId, status: "SUCCEEDED", processedAt: inRange, ...(scope === null ? {} : { payment: byJob }) }, select: { amount: true, payment: { select: { currency: true } } } }),
    prisma.maintenanceLog.findMany({ where: { spaceId, performedAt: inRange, ...byMachine }, select: { machineId: true, cost: true } }),
    prisma.maintenanceSchedule.findMany({ where: { spaceId, isActive: true, machine: { retiredAt: null, ...byType } }, select: { trigger: true, intervalDays: true, intervalHours: true, intervalJobs: true, nextDueAt: true, meterMinutesAtLast: true, meterJobsAtLast: true, machineId: true } }),
    prisma.warranty.findMany({ where: { spaceId, machine: { retiredAt: null, ...byType } }, orderBy: { expiresOn: "asc" }, select: { vendorName: true, contractNumber: true, expiresOn: true, machine: { select: { name: true, slug: true } } } }),
    prisma.spaceJobSettings.findUnique({ where: { spaceId }, select: { maintenanceReminderDays: true, warrantyReminderDays: true } }),
  ]);
  const meters = new Map(machines.map((machine) => [machine.id, machine]));
  const overdue = schedules.filter((schedule) => meters.has(schedule.machineId) &&
    scheduleDue(schedule, meters.get(schedule.machineId)!, now, settings?.maintenanceReminderDays ?? 3).state === "OVERDUE").length;
  const utilisation = utilisationReport(machines, usage, downtime, faults, from, to);
  return {
    jobs: jobsReport(jobs.map((job) => ({ status: job.status, typeName: job.type.name, machineName: job.assignedMachine?.name ?? null, submittedAt: job.submittedAt, completedAt: job.completedAt }))),
    utilisation,
    consumables: consumablesReport(adjustments.map((row) => ({ poolLabel: [row.pool.brand, row.pool.material, row.pool.colour].filter(Boolean).join(" "),
      material: row.pool.material, unit: row.pool.unit, kind: row.kind, delta: Number(row.delta), costPerUnit: row.pool.costPerUnit }))),
    revenue: revenueReport(payments.map((row) => ({ currency: row.currency, status: row.status, method: row.method, amount: row.amount,
      typeName: row.job.type.name, machineName: row.job.assignedMachine?.name ?? null })), refunds.map((row) => ({ currency: row.payment.currency, amount: row.amount }))),
    maintenance: maintenanceReport(utilisation, logs, overdue, downtime, faults, from, to),
    warranty: warranties.map((row) => ({ machine: row.machine.name, machineSlug: row.machine.slug, vendor: row.vendorName, contract: row.contractNumber,
      expiresOn: row.expiresOn?.toISOString().slice(0, 10) ?? null, state: warrantyState(row.expiresOn, now, settings?.warrantyReminderDays ?? 30) })),
  };
}
export type Reports = Awaited<ReturnType<typeof loadReports>>;

/** The same reports with every amount removed, for roles that see no money (owner decision 2026-10-24). */
export function withoutMoney(reports: Reports) {
  return { ...reports, revenue: null, consumables: reports.consumables.map((row) => ({ ...row, cost: null })),
    maintenance: { ...reports.maintenance, cost: null } };
}
