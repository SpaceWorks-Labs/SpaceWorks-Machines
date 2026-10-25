import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import * as ledger from "@/lib/consumables/ledger";
import { freeJobPaymentEffects } from "@/lib/jobs";
import { jobsFixture, type JobsFixture } from "../helpers/jobs-db";
import { transaction } from "../helpers/machines-db";

vi.mock("@/lib/webhooks/emit", async (original) => ({ ...await original<object>(), enqueueWebhookDeliveries: vi.fn() }));
let f: JobsFixture;
beforeEach(async () => { f = await jobsFixture(); });
afterEach(async () => { vi.restoreAllMocks(); await f?.cleanup(); });

describe("job locks and concurrent capacity", () => {
  it("holds the job lock before the machine, then the machine before taking the pool lock", async () => {
    const job = await f.approve();
    const original = ledger.lockPool;
    let sawPool = false;
    vi.spyOn(ledger, "lockPool").mockImplementation(async (tx, spaceId, poolId) => {
      // Called just before the start helper takes its first pool lock. A separate connection observes the locks.
      if (!sawPool) {
        await expect(transaction((observer) => observer.$queryRaw`SELECT "id" FROM "Machine" WHERE "id" = ${f.home.machine.id} FOR UPDATE NOWAIT`)).rejects.toThrow();
        await transaction((observer) => observer.$queryRaw`SELECT "id" FROM "ConsumablePool" WHERE "id" = ${poolId} FOR UPDATE NOWAIT`);
        sawPool = true;
      }
      return original(tx, spaceId, poolId);
    });
    const canStart = async () => {
      await expect(transaction((observer) => observer.$queryRaw`SELECT "id" FROM "Job" WHERE "id" = ${job.id} FOR UPDATE NOWAIT`)).rejects.toThrow();
      await transaction((observer) => observer.$queryRaw`SELECT "id" FROM "Machine" WHERE "id" = ${f.home.machine.id} FOR UPDATE NOWAIT`);
      return true;
    };
    await f.act(job.id, { kind: "start", poolId: f.home.pool.id }, { payments: { ...freeJobPaymentEffects, canStart } });
    expect(sawPool).toBe(true);
  });
  it("prevents two starts on different machines from exceeding maxConcurrentJobs, including resume", async () => {
    await f.type({ maxConcurrentJobs: 1 });
    const m2 = await prisma.machine.create({ data: { spaceId: f.home.space.id, typeId: f.home.type.id, slug: "second", name: "Second" } });
    const first = await f.approve(); const second = await f.approve();
    const results = await Promise.allSettled([
      f.act(first.id, { kind: "start", machineId: f.home.machine.id, poolId: f.home.pool.id }),
      f.act(second.id, { kind: "start", machineId: m2.id, poolId: f.home.pool.id }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.job.count({ where: { spaceId: f.home.space.id, status: "RUNNING" } })).toBe(1);
    expect((await f.pool()).remainingQuantity.toString()).toBe("90");
    const active = (await f.readJob(first.id)).status === "RUNNING" ? first : second;
    const waiting = active.id === first.id ? second : first;
    await f.act(active.id, { kind: "pause" });
    await f.act(waiting.id, { kind: "start", poolId: f.home.pool.id });
    await expect(f.act(active.id, { kind: "resume" })).rejects.toThrow("concurrent job limit");
  });
  it("serialises duplicate starts and completions to exactly one reservation and usage row", async () => {
    const job = await f.approve();
    const starts = await Promise.allSettled([f.act(job.id, { kind: "start", poolId: f.home.pool.id }), f.act(job.id, { kind: "start", poolId: f.home.pool.id })]);
    expect(starts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const ends = await Promise.allSettled([f.act(job.id, { kind: "complete", actualMinutes: 7 }), f.act(job.id, { kind: "complete", actualMinutes: 7 })]);
    expect(ends.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.consumableAdjustment.count({ where: { jobId: job.id, kind: "RESERVE" } })).toBe(1);
    expect(await prisma.usageLog.count({ where: { jobId: job.id } })).toBe(1);
    expect(await f.machine()).toMatchObject({ meterMinutes: 7, meterJobs: 1 });
  });
});
