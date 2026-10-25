import "server-only";
import type { Prisma } from "@prisma/client";

/** Minimal API shapes: ids, names, states and amounts. No emails, notes, files or secrets. */

export const MACHINE_DTO = { id: true, slug: true, name: true, status: true, typeId: true, isPublic: true, acceptsJobs: true,
  retiredAt: true, meterMinutes: true, meterJobs: true, location: true, createdAt: true } satisfies Prisma.MachineSelect;
export const machineDto = (row: Prisma.MachineGetPayload<{ select: typeof MACHINE_DTO }>) => ({ ...row, retired: row.retiredAt !== null,
  retiredAt: row.retiredAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() });

export const TYPE_DTO = { id: true, slug: true, name: true, icon: true, meteringUnit: true, consumableUnit: true, acceptsJobs: true, archivedAt: true } satisfies Prisma.MachineTypeSelect;
export const typeDto = (row: Prisma.MachineTypeGetPayload<{ select: typeof TYPE_DTO }>) => ({ ...row, archived: row.archivedAt !== null, archivedAt: row.archivedAt?.toISOString() ?? null });

export const JOB_DTO = { id: true, number: true, status: true, typeId: true, machineId: true, assignedMachineId: true, title: true, quantity: true, priority: true,
  audience: true, currency: true, quotedAmount: true, finalAmount: true, amountPaid: true, amountRefunded: true, paymentState: true,
  estimatedMinutes: true, actualMinutes: true, submittedAt: true, startedAt: true, completedAt: true, collectedAt: true } satisfies Prisma.JobSelect;
export const jobDto = (row: Prisma.JobGetPayload<{ select: typeof JOB_DTO }>) => ({ ...row,
  submittedAt: row.submittedAt.toISOString(), startedAt: row.startedAt?.toISOString() ?? null,
  completedAt: row.completedAt?.toISOString() ?? null, collectedAt: row.collectedAt?.toISOString() ?? null });

export const POOL_DTO = { id: true, material: true, colour: true, brand: true, unit: true, remainingQuantity: true, lowThreshold: true,
  machineId: true, typeId: true, isActive: true } satisfies Prisma.ConsumablePoolSelect;
export const poolDto = (row: Prisma.ConsumablePoolGetPayload<{ select: typeof POOL_DTO }>) => ({ ...row,
  remainingQuantity: row.remainingQuantity.toString(), lowThreshold: row.lowThreshold?.toString() ?? null });

export const SCHEDULE_DTO = { id: true, machineId: true, title: true, trigger: true, intervalDays: true, intervalHours: true, intervalJobs: true,
  nextDueAt: true, lastDoneAt: true, isActive: true } satisfies Prisma.MaintenanceScheduleSelect;
export const scheduleDto = (row: Prisma.MaintenanceScheduleGetPayload<{ select: typeof SCHEDULE_DTO }>) => ({ ...row,
  nextDueAt: row.nextDueAt?.toISOString() ?? null, lastDoneAt: row.lastDoneAt?.toISOString() ?? null });

export const LOG_DTO = { id: true, machineId: true, scheduleId: true, faultId: true, kind: true, summary: true, cost: true, performedAt: true } satisfies Prisma.MaintenanceLogSelect;
export const logDto = (row: Prisma.MaintenanceLogGetPayload<{ select: typeof LOG_DTO }>) => ({ ...row, performedAt: row.performedAt.toISOString() });

export const FAULT_DTO = { id: true, number: true, machineId: true, severity: true, status: true, title: true, createdAt: true, resolvedAt: true } satisfies Prisma.FaultReportSelect;
export const faultDto = (row: Prisma.FaultReportGetPayload<{ select: typeof FAULT_DTO }>) => ({ ...row,
  createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null });

export const PAYMENT_DTO = { id: true, jobId: true, kind: true, method: true, status: true, amount: true, currency: true, amountRefunded: true, paidAt: true, createdAt: true } satisfies Prisma.PaymentSelect;
export const paymentDto = (row: Prisma.PaymentGetPayload<{ select: typeof PAYMENT_DTO }>) => ({ ...row,
  paidAt: row.paidAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() });
