import "server-only";

import { recordHeartbeatSuccess, WORKER_HEARTBEAT_KEY } from "@/lib/operationalHeartbeat";
import { purgeExpiredOperationalData } from "@/lib/retention";
import type { JobDefinition } from "./definitions";
import { enqueueDueOutbox } from "./enqueue";
import { runMaintenanceSweep, runWarrantySweep } from "@/lib/upkeep/sweeps";
import { relayDueWebhooks } from "@/lib/webhooks/deliver";
import { pollPrinters } from "@/lib/printers/poll";

/**
 * Periodic work. Beat turns every entry into a repeatable BullMQ job; the worker runs it by `area`.
 * Later phases add their own entries here (jobs: queue positions and reminders; upkeep: maintenance
 * schedules and warranty alerts; integrations: printer polling on the `sync` queue). A failing entry is
 * retried by BullMQ and never stops the others.
 */
export const SCHEDULED_JOBS: ReadonlyArray<JobDefinition> = [
  { area: "outbox-relay", queue: "outbox", schedule: { every: 60_000 }, run: () => enqueueDueOutbox() },
  { area: "operational-retention", schedule: { pattern: "0 * * * *", tz: "UTC" }, run: (now) => purgeExpiredOperationalData(now) },
  { area: "printer-poll", queue: "sync", schedule: { every: 15_000 }, run: (now) => pollPrinters(now) },
  { area: "webhook-relay", queue: "sync", schedule: { every: 60_000 }, run: (now) => relayDueWebhooks(now) },
  { area: "maintenance-due", schedule: { pattern: "15 6 * * *", tz: "UTC" }, run: (now) => runMaintenanceSweep(now) },
  { area: "warranty-expiry", schedule: { pattern: "30 6 * * *", tz: "UTC" }, run: (now) => runWarrantySweep(now) },
  { area: "worker-heartbeat", schedule: { every: 60_000 }, run: () => recordHeartbeatSuccess(WORKER_HEARTBEAT_KEY, { sent: 0, failed: 0 }) },
];
