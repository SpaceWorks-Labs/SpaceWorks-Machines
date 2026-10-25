import type { ChipTone } from "@/components/ui/display";
import type { DueState, WarrantyState } from "./due";

/** Words for every upkeep state; pills always carry one. Client-safe. */
export const DUE_LABELS: Record<DueState, { label: string; tone: ChipTone }> = {
  OK: { label: "On track", tone: "success" }, DUE_SOON: { label: "Due soon", tone: "warning" }, OVERDUE: { label: "Overdue", tone: "danger" },
};
export const WARRANTY_LABELS: Record<WarrantyState, { label: string; tone: ChipTone }> = {
  UNKNOWN: { label: "No expiry date", tone: "neutral" }, ACTIVE: { label: "Active", tone: "success" },
  EXPIRING_SOON: { label: "Expiring soon", tone: "warning" }, EXPIRED: { label: "Expired", tone: "danger" },
};
export const TRIGGER_LABELS = { TIME: "Every few days", USAGE_HOURS: "Every few machine hours", JOB_COUNT: "Every few jobs" } as const;
export const KIND_LABELS = { PREVENTIVE: "Preventive", CORRECTIVE: "Corrective", INSPECTION: "Inspection", CALIBRATION: "Calibration", WARRANTY_REPAIR: "Warranty repair" } as const;
export const REASON_LABELS = { PLANNED_MAINTENANCE: "Planned maintenance", FAULT: "Fault", REPAIR: "Repair", WAITING_PARTS: "Waiting for parts", OTHER: "Other" } as const;
export const SEVERITY_LABELS: Record<string, { label: string; tone: ChipTone }> = {
  LOW: { label: "Low", tone: "neutral" }, MEDIUM: { label: "Medium", tone: "info" }, HIGH: { label: "High", tone: "warning" }, CRITICAL: { label: "Critical", tone: "danger" },
};
export const FAULT_STATUS_LABELS: Record<string, { label: string; tone: ChipTone }> = {
  OPEN: { label: "Open", tone: "danger" }, ACKNOWLEDGED: { label: "Acknowledged", tone: "warning" }, IN_PROGRESS: { label: "In progress", tone: "info" },
  FIXED: { label: "Fixed, to check", tone: "accent" },
  RESOLVED: { label: "Resolved", tone: "success" }, WONT_FIX: { label: "Won't fix", tone: "neutral" },
};
export const faultNumber = (number: number) => `F-${String(number).padStart(4, "0")}`;

export function dueText(due: { remaining: number | null; unit: "days" | "hours" | "jobs" }) {
  if (due.remaining === null) return "No due date";
  const n = Math.abs(due.remaining);
  const unit = n === 1 ? due.unit.slice(0, -1) : due.unit;
  return due.remaining < 0 ? `${n} ${unit} overdue` : due.remaining === 0 ? "Due now" : `In ${n} ${unit}`;
}
