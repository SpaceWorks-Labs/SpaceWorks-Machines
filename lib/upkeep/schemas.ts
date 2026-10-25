import { z } from "zod";

/** Form contracts for the upkeep actions. Client-safe. */

const id = z.string().trim().min(1).max(64);
const slug = z.string().trim().min(1).max(64);
/** A blank select ("None", "Nobody") means no id. */
const optionalId = z.preprocess((value) => value === "" ? null : value, id.nullish());
const dateInput = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date").or(z.literal("")).nullish().transform((value) => value || null);
/** Blank means "not used by this trigger"; the domain checks the one the trigger needs. */
const count = (max: number) => z.preprocess((value) => value === "" || value === undefined ? null : value,
  z.coerce.number().int("Enter a whole number").min(1, "Enter 1 or more").max(max, `Enter ${max} or less`).nullable());

export const MAINTENANCE_TRIGGERS = ["TIME", "USAGE_HOURS", "JOB_COUNT"] as const;
export const MAINTENANCE_KINDS = ["PREVENTIVE", "CORRECTIVE", "INSPECTION", "CALIBRATION", "WARRANTY_REPAIR"] as const;
export const DOWNTIME_REASONS = ["PLANNED_MAINTENANCE", "FAULT", "REPAIR", "WAITING_PARTS", "OTHER"] as const;
export const FAULT_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const FAULT_STATUSES = ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "WONT_FIX"] as const;

export const scheduleSchema = z.object({
  spaceSlug: slug, title: z.string().trim().min(1, "Give the schedule a title").max(120), description: z.string().trim().max(2000).default(""),
  checklist: z.string().max(6000).default("").transform((value) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 30)),
  trigger: z.enum(MAINTENANCE_TRIGGERS), intervalDays: count(3650), intervalHours: count(100_000), intervalJobs: count(100_000),
  firstDueOn: dateInput, blockWhenOverdue: z.boolean().default(false),
});
export const createScheduleSchema = scheduleSchema.extend({ machineId: id });
export const updateScheduleSchema = scheduleSchema.extend({ scheduleId: id, isActive: z.boolean().default(true) });

/** Cost as typed in the space currency; the action turns it into minor units. */
export const logSchema = z.object({
  spaceSlug: slug, machineId: id, scheduleId: optionalId, faultId: optionalId, kind: z.enum(MAINTENANCE_KINDS),
  summary: z.string().trim().min(1, "Summarise the work done").max(200), details: z.string().trim().max(5000).default(""),
  partsNote: z.string().trim().max(2000).default(""), cost: z.string().trim().max(32).default(""), vendor: z.string().trim().max(200).default(""),
  costMethod: z.enum(["CASH", "BANK_TRANSFER", "UPI", "OTHER"]).default("OTHER"),
  performedOn: dateInput, restoreIdle: z.boolean().default(false),
});

export const startDowntimeSchema = z.object({ spaceSlug: slug, machineId: id, reason: z.enum(DOWNTIME_REASONS),
  note: z.string().trim().max(2000).default(""), status: z.enum(["MAINTENANCE", "OFFLINE"]).default("MAINTENANCE") });
export const endDowntimeSchema = z.object({ spaceSlug: slug, machineId: id });

export const reportFaultSchema = z.object({ spaceSlug: slug, machineId: id, severity: z.enum(FAULT_SEVERITIES).default("MEDIUM"),
  title: z.string().trim().min(1, "Say what's wrong in a few words").max(120), description: z.string().trim().max(5000).default(""),
  takeOffline: z.boolean().default(false) });
export const updateFaultSchema = z.object({ spaceSlug: slug, faultId: id, status: z.enum(FAULT_STATUSES).optional(),
  assignedToId: optionalId, resolution: z.string().trim().max(2000).optional() });

export const warrantySchema = z.object({ spaceSlug: slug, machineId: id,
  vendorName: z.string().trim().max(200).default(""), vendorContact: z.string().trim().max(200).default(""),
  vendorEmail: z.string().trim().max(254).email("Enter a valid email address").or(z.literal("")).default(""),
  vendorPhone: z.string().trim().max(40).default(""), contractNumber: z.string().trim().max(120).default(""), coverage: z.string().trim().max(2000).default(""),
  purchasedOn: dateInput, startsOn: dateInput, expiresOn: dateInput });

export const manualUsageSchema = z.object({ spaceSlug: slug, machineId: id, minutes: z.coerce.number().int("Enter whole minutes").min(0).max(100_000),
  succeeded: z.boolean().default(true), note: z.string().trim().max(2000).default(""),
  poolId: optionalId, quantity: z.string().trim().max(32).optional() });
