import type { JobStatus } from "@prisma/client";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";
import type { queuePosition } from "./queue";

export const JOB_STATUSES = ["SUBMITTED", "APPROVED", "RUNNING", "PAUSED", "COMPLETED", "COLLECTED", "REJECTED", "FAILED", "CANCELLED"] as const;
export const STATUS_LABELS: Record<JobStatus, string> = { SUBMITTED: "Submitted", APPROVED: "Approved", RUNNING: "Running", PAUSED: "Paused", COMPLETED: "Awaiting collection", COLLECTED: "Collected", REJECTED: "Rejected", FAILED: "Failed", CANCELLED: "Cancelled" };
export function words(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()); }
export function jobNumber(number: number) { return `J-${String(number).padStart(4, "0")}`; }
export function money(amount: number, currency: string) { return isCurrencyCode(currency) ? formatMoney(amount, currency) : `${amount} ${currency}`; }
export function duration(minutes: number) {
  const rounded = Math.max(0, Math.ceil(minutes));
  return [rounded >= 60 ? `${Math.floor(rounded / 60)} h` : "", rounded % 60 || !rounded ? `${rounded % 60} min` : ""].filter(Boolean).join(" ");
}
export function queueLabel(queue: ReturnType<typeof queuePosition>) {
  if (!queue) return "";
  return [`#${queue.position} in the queue`, `${queue.approvedAhead} approved job${queue.approvedAhead === 1 ? "" : "s"} ahead`,
    queue.awaitingReviewAhead ? `${queue.awaitingReviewAhead} awaiting review ahead` : "",
    queue.etaMinutes == null ? "" : `about ${duration(queue.etaMinutes)}`].filter(Boolean).join(" · ");
}
export function remainingMinutes(job: { status: string; startedAt: Date | string | null; estimatedMinutes: number | null }, now = new Date()) {
  if (job.status !== "RUNNING" || !job.startedAt || job.estimatedMinutes == null) return null;
  return Math.max(0, Math.ceil(job.estimatedMinutes - (now.getTime() - new Date(job.startedAt).getTime()) / 60000));
}
/** Spreadsheet formula prefixes must stay literal when staff open the export. */
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
}
