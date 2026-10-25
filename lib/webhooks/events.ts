/**
 * Outbound webhook events (docs/plans/domain-behaviour.md §5). Client-safe: the Phase 5 endpoint editor lists
 * them. Payloads carry ids and minimal facts, never personal data or secrets.
 */
export const WEBHOOK_EVENTS = [
  "machine.created",
  "machine.updated",
  "machine.status_changed",
  "machine.retired",
  "job.submitted",
  "job.approved",
  "job.rejected",
  "job.started",
  "job.paused",
  "job.resumed",
  "job.completed",
  "job.failed",
  "job.collected",
  "job.cancelled",
  "job.reprinted",
  "job.priority_changed",
  "job.reassigned",
  "job.noted",
  "payment.paid",
  "payment.refunded",
  "consumable.low_stock",
  "maintenance.due",
  "maintenance.logged",
  "fault.reported",
  "fault.resolved",
  "downtime.started",
  "downtime.ended",
  "repair.paid",
  "finance.entry_posted",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return typeof value === "string" && (WEBHOOK_EVENTS as readonly string[]).includes(value);
}
