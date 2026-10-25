import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { recordUsage, type UsageInput } from "@/lib/usage";
import { jobsFixture, type JobsFixture } from "../helpers/jobs-db";
import { transaction } from "../helpers/machines-db";

let f: JobsFixture;
beforeEach(async () => { f = await jobsFixture(); });
afterEach(async () => { await f?.cleanup(); });
const record = (input: Partial<UsageInput> = {}) => transaction((tx) => recordUsage(tx, { spaceId: f.home.space.id,
  machineId: f.home.machine.id, source: "MANUAL", actorId: f.home.user.id, minutes: 30, succeeded: true, ...input }));

describe("single usage writer", () => {
  it("records manual usage, meters and optional stock in the MANUAL ledger", async () => {
    const result = await record({ quantity: "3.125", unit: "GRAMS", poolId: f.home.pool.id });
    expect(result.log).toMatchObject({ source: "MANUAL", minutes: 30, succeeded: true, percentComplete: 100 });
    expect(await f.machine()).toMatchObject({ meterMinutes: 30, meterJobs: 1 });
    expect((await f.pool()).remainingQuantity.toString()).toBe("96.875");
    const row = await prisma.consumableAdjustment.findFirst({ where: { usageLogId: result.log.id } });
    expect(row).toMatchObject({ kind: "MANUAL", actorId: f.home.user.id });
    expect(row?.delta.toString()).toBe("-3.125");
    expect(await prisma.auditEvent.count({ where: { action: "usage.recorded", targetId: result.log.id } })).toBe(1);
  });
  it("records ADAPTER usage deltas and failed/manual runs with correct meters", async () => {
    await record({ source: "ADAPTER", actorId: undefined, minutes: 4, succeeded: false, percentComplete: 40 });
    await record({ minutes: 0, succeeded: false });
    expect(await f.machine()).toMatchObject({ meterMinutes: 4, meterJobs: 2 });
    expect(await prisma.usageLog.findFirst({ where: { machineId: f.home.machine.id, source: "ADAPTER" } })).toMatchObject({ succeeded: false, percentComplete: 40, loggedById: null });
  });
  it("serialises concurrent meter increments without lost updates", async () => {
    await Promise.all([record({ minutes: 12 }), record({ minutes: 17 })]);
    expect(await f.machine()).toMatchObject({ meterMinutes: 29, meterJobs: 2 });
  });
  it("rolls the log and meters back if stock is insufficient", async () => {
    await expect(record({ quantity: "101", unit: "GRAMS", poolId: f.home.pool.id })).rejects.toThrow("Not enough stock");
    expect(await f.machine()).toMatchObject({ meterMinutes: 0, meterJobs: 0 });
    expect(await prisma.usageLog.count({ where: { machineId: f.home.machine.id } })).toBe(0);
    expect((await f.pool()).remainingQuantity.toString()).toBe("100");
  });
  it("checks tenancy, source, job ownership, manual capability and quantity/unit guards", async () => {
    await expect(record({ machineId: f.away.machine.id })).rejects.toThrow("Space not found");
    await expect(record({ poolId: f.away.pool.id, quantity: "1", unit: "GRAMS" })).rejects.toThrow("Pool not found");
    await expect(record({ actorId: f.maker.id })).rejects.toThrow("cannot perform");
    await expect(record({ minutes: -1 })).rejects.toThrow("non-negative");
    await expect(record({ source: "JOB" })).rejects.toThrow("needs a job");
    await expect(record({ source: "ADAPTER", poolId: f.home.pool.id })).rejects.toThrow("cannot take");
    await expect(record({ poolId: f.home.pool.id, unit: "SHEETS", quantity: "1" })).rejects.toThrow("same quantity unit");
    await expect(record({ quantity: "-1" })).rejects.toThrow("negative");
    await expect(record({ percentComplete: 101 })).rejects.toThrow("between 0 and 100");
  });
  it("records JOB usage only on the job's assigned machine and prevents duplicate job meters", async () => {
    const job = await f.running();
    await expect(record({ source: "JOB", jobId: job.id, machineId: f.away.machine.id })).rejects.toThrow("running job's machine");
    await record({ source: "JOB", jobId: job.id, quantity: "10", unit: "GRAMS", poolId: f.home.pool.id });
    // JOB logs do not take stock for a second time.
    expect((await f.pool()).remainingQuantity.toString()).toBe("90");
    await expect(record({ source: "JOB", jobId: job.id })).rejects.toThrow("already recorded");
    expect(await f.machine()).toMatchObject({ meterMinutes: 30, meterJobs: 1 });
  });
});
