import { describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/outbox", () => ({ deliverOutboxBatch: vi.fn() }));
vi.mock("@/lib/retention", () => ({ purgeExpiredOperationalData: vi.fn() }));
vi.mock("@/lib/operationalHeartbeat", () => ({ recordHeartbeatSuccess: vi.fn(), recordOutboxSchedulerSuccess: vi.fn(), recordOutboxSchedulerFailure: vi.fn(), WORKER_HEARTBEAT_KEY: "worker" }));

import { jobId, queueConcurrency, scheduleDefinitions, type JobDefinition, type QueueJob } from "@/lib/queue/definitions";
import { SCHEDULED_JOBS } from "@/lib/queue/registry";
import { processQueueJob } from "@/lib/queue/worker";

describe("job queue definitions", () => {
  it("schedules every registry area once, on the scheduled queue unless it says otherwise", () => {
    const definitions = scheduleDefinitions(SCHEDULED_JOBS);
    expect(definitions.map((item) => item.id)).toEqual(SCHEDULED_JOBS.map((job) => `registry-${job.area}`));
    expect(definitions.find((item) => item.id === "registry-outbox-relay")).toMatchObject({ queue: "outbox", schedule: { every: 60_000 } });
    expect(definitions.find((item) => item.id === "registry-operational-retention")).toMatchObject({ queue: "scheduled", schedule: { pattern: "0 * * * *" } });
  });

  it("refuses duplicate areas and intervals under a second", () => {
    const run = async () => undefined;
    expect(() => scheduleDefinitions([{ area: "a", run }, { area: "a", run }])).toThrow("Duplicate job area.");
    expect(() => scheduleDefinitions([{ area: "a", schedule: { every: 10 }, run }])).toThrow("Invalid job interval.");
  });

  it("derives stable, opaque job ids", () => {
    expect(jobId("outbox", "row_1")).toBe(jobId("outbox", "row_1"));
    expect(jobId("outbox", "row_1")).not.toContain("row_1");
  });

  it("reads concurrency from the environment within bounds", () => {
    expect(queueConcurrency("outbox", {})).toBe(5);
    expect(queueConcurrency("sync", { QUEUE_SYNC_CONCURRENCY: "4" })).toBe(4);
    expect(() => queueConcurrency("sync", { QUEUE_SYNC_CONCURRENCY: "0" })).toThrow();
  });

  it("runs a registered job by area and refuses removed ones", async () => {
    const run = vi.fn(async () => undefined);
    const registry: JobDefinition[] = [{ area: "machines-sweep", run }];
    const job = (data: QueueJob) => ({ data }) as Job<QueueJob>;
    await processQueueJob(job({ kind: "registered", area: "machines-sweep" }), undefined, registry);
    expect(run).toHaveBeenCalledOnce();
    await expect(processQueueJob(job({ kind: "registered", area: "gone" }), undefined, registry)).rejects.toThrow("Job registration removed");
    await expect(processQueueJob(job({ kind: "outbox", outboxId: "bad id!" }), undefined, registry)).rejects.toThrow("Invalid job definition");
  });
});
