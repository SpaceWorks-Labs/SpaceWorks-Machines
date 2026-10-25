import "server-only";

import { deliverOutboxBatch } from "@/lib/outbox";
import { recordOutboxSchedulerFailure, recordOutboxSchedulerStarted, recordOutboxSchedulerSuccess } from "@/lib/operationalHeartbeat";
import { purgeExpiredOperationalData } from "@/lib/retention";

const OUTBOX_WORKER_INTERVAL_MS = 60_000;

type OutboxWorkerState = { started?: boolean; running?: boolean; timer?: ReturnType<typeof setInterval> };

function workerState() {
  return globalThis as typeof globalThis & { __swmOutboxWorker?: OutboxWorkerState };
}

/**
 * One delivery and retention pass without Redis. Production runs the BullMQ `worker` and `beat` roles
 * instead (lib/queue); this exists for local development (JOBS_INPROCESS=true with no REDIS_URL) and for
 * the super-admin "deliver now" button.
 */
export async function runOutboxScheduler() {
  await recordOutboxSchedulerStarted().catch(() => undefined);
  try {
    const result = await deliverOutboxBatch();
    const purged = await purgeExpiredOperationalData();
    await recordOutboxSchedulerSuccess(result).catch(() => undefined);
    return { ...result, purged };
  } catch (error) {
    await recordOutboxSchedulerFailure(error).catch(() => undefined);
    throw error;
  }
}

/** A one-minute timer in this process. Queue row claims make several processes safe; the guard stops HMR duplicates. */
export function startOutboxWorker() {
  const runtime = workerState();
  if (runtime.__swmOutboxWorker?.started) return;
  const state: OutboxWorkerState = { started: true, running: false };
  runtime.__swmOutboxWorker = state;
  const tick = async () => {
    if (state.running) return;
    state.running = true;
    try {
      await runOutboxScheduler();
    } catch {
      console.error("[outbox worker] in-process run failed");
    } finally {
      state.running = false;
    }
  };
  void tick();
  state.timer = setInterval(() => void tick(), OUTBOX_WORKER_INTERVAL_MS);
  state.timer.unref?.();
}
