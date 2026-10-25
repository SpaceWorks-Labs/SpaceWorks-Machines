import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { transitionJob, jobFilesForRequester, freeJobPaymentEffects } from "@/lib/jobs";
import { jobsFixture, type JobsFixture } from "../helpers/jobs-db";

vi.mock("@/lib/webhooks/emit", async (original) => ({ ...await original<object>(), enqueueWebhookDeliveries: vi.fn() }));
let f: JobsFixture;
beforeEach(async () => { f = await jobsFixture(); });
afterEach(async () => { await f?.cleanup(); });

describe("job lifecycle transactions", () => {
  it.each(["cancel", "reject"] as const)("does not release another job's paused machine on queued job %s", async (kind) => {
    const running = await f.running();
    await f.act(running.id, { kind: "pause" });
    const queued = await f.approve();
    await f.act(queued.id, { kind: "reassign", machineId: f.home.machine.id });
    await f.act(queued.id, { kind, reason: "No longer needed" });
    expect((await f.machine()).status).toBe("PAUSED");
    expect((await f.readJob(running.id)).status).toBe("PAUSED");
    await f.act(running.id, { kind: "resume" });
    expect((await f.machine()).status).toBe("RUNNING");
  });
  it("keeps a reserved machine reserved while another waiting job is assigned to it", async () => {
    await prisma.machine.update({ where: { id: f.home.machine.id }, data: { status: "RESERVED" } });
    const first = await f.approve();
    const second = await f.approve();
    for (const job of [first, second]) await f.act(job.id, { kind: "reassign", machineId: f.home.machine.id });
    await f.act(first.id, { kind: "cancel", reason: "No longer needed" });
    expect((await f.machine()).status).toBe("RESERVED");
    await f.act(second.id, { kind: "cancel", reason: "No longer needed" });
    expect((await f.machine()).status).toBe("IDLE");
  });
  it("approves, allocates FIRST_IDLE, reserves, pauses, resumes, reconciles, records usage and collects", async () => {
    const { job } = await f.submit();
    await f.act(job.id, { kind: "approve", estimatedMinutes: 60, estimatedQuantity: "10", note: "Ready" });
    const start = await f.act(job.id, { kind: "start", poolId: f.home.pool.id });
    expect(start.job).toMatchObject({ status: "RUNNING", assignedMachineId: f.home.machine.id, runSnapshot: { machineName: f.home.machine.name, estimatedQuantity: "10" } });
    expect((await f.pool()).remainingQuantity.toString()).toBe("90");
    await f.act(job.id, { kind: "pause" }); expect((await f.machine()).status).toBe("PAUSED");
    await f.act(job.id, { kind: "resume" }); expect((await f.machine()).status).toBe("RUNNING");
    await f.act(job.id, { kind: "complete", actualMinutes: 45, actualQuantity: "8.125" });
    expect((await f.pool()).remainingQuantity.toString()).toBe("91.875");
    expect(await f.machine()).toMatchObject({ status: "IDLE", meterMinutes: 45, meterJobs: 1 });
    expect(await prisma.usageLog.findMany({ where: { jobId: job.id } })).toEqual([expect.objectContaining({ source: "JOB", minutes: 45, succeeded: true, poolId: f.home.pool.id })]);
    await f.act(job.id, { kind: "collect" });
    expect(await f.readJob(job.id)).toMatchObject({ status: "COLLECTED", finalAmount: 0 });
    const events = await prisma.jobEvent.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.kind)).toEqual(["submitted", "approved", "started", "paused", "resumed", "completed", "collected"]);
    for (const event of events) expect(await prisma.auditEvent.count({ where: { targetId: job.id, action: `job.${event.kind}` } })).toBe(1);
    await expect(f.act(job.id, { kind: "complete", actualMinutes: 45 })).rejects.toThrow("Cannot complete");
    expect((await f.machine()).meterJobs).toBe(1);
  });
  it("defaults completed actual quantity to reserved and finalises from PAUSED", async () => {
    const job = await f.running();
    await f.act(job.id, { kind: "pause" });
    await f.act(job.id, { kind: "complete", actualMinutes: 10 });
    expect((await f.readJob(job.id)).actualQuantity?.toString()).toBe("10");
    expect((await f.pool()).remainingQuantity.toString()).toBe("90");
  });
  it("fails with a percent, reconciles fractional use, records failed usage and frees the machine", async () => {
    const job = await f.running();
    await f.act(job.id, { kind: "fail", actualMinutes: 12, reason: "Layer shifted", percent: 25 });
    expect((await f.pool()).remainingQuantity.toString()).toBe("97.5");
    expect(await f.readJob(job.id)).toMatchObject({ status: "FAILED", failPercent: 25, statusReason: "Layer shifted" });
    expect(await prisma.usageLog.findFirst({ where: { jobId: job.id } })).toMatchObject({ succeeded: false, percentComplete: 25, minutes: 12 });
    expect(await f.machine()).toMatchObject({ status: "IDLE", meterMinutes: 12, meterJobs: 1 });
  });
  it("allows actual quantity to override failure percent and clamps extra consumption with a reported shortfall", async () => {
    const job = await f.running();
    const result = await f.act(job.id, { kind: "fail", actualMinutes: 12, actualQuantity: "110", reason: "Spill", percent: 100 });
    expect((await f.pool()).remainingQuantity.toString()).toBe("0");
    expect(result.job.actualQuantity?.toString()).toBe("110");
    expect(await prisma.jobEvent.findFirst({ where: { jobId: job.id, kind: "failed" } })).toMatchObject({ data: { shortfall: "10" } });
  });
  it("rejects submitted/approved jobs with a reason and invokes the outcome hook", async () => {
    const onRejectedCancelledFailed = vi.fn();
    const deps = { payments: { ...freeJobPaymentEffects, onRejectedCancelledFailed } };
    const first = await f.submit();
    await expect(f.act(first.job.id, { kind: "reject", reason: " " }, deps)).rejects.toThrow("reason");
    await f.act(first.job.id, { kind: "reject", reason: "Unsupported geometry" }, deps);
    const second = await f.approve();
    await f.act(second.id, { kind: "reject", reason: "Unsafe material" }, deps);
    expect(onRejectedCancelledFailed).toHaveBeenCalledTimes(2);
    expect(onRejectedCancelledFailed.mock.calls[0][2]).toBe("rejected");
  });
  it("lets requesters cancel while waiting, enforces the switch, and lets staff cancel PAUSED with full release", async () => {
    const waiting = await f.approve();
    await f.settings({ allowRequesterCancel: false });
    await expect(f.act(waiting.id, { kind: "cancel" }, {}, f.maker.id)).rejects.toThrow("cannot cancel");
    await f.settings({ allowRequesterCancel: true });
    await expect(f.act(waiting.id, { kind: "cancel" }, {}, f.outsider.id)).rejects.toThrow("cannot cancel");
    await f.act(waiting.id, { kind: "cancel" }, {}, f.maker.id);
    const running = await f.running();
    await expect(f.act(running.id, { kind: "cancel" })).rejects.toThrow("Cannot cancel");
    await f.act(running.id, { kind: "pause" });
    await expect(f.act(running.id, { kind: "cancel" }, {}, f.maker.id)).rejects.toThrow("cannot cancel");
    await f.act(running.id, { kind: "cancel", reason: "Stop requested" });
    expect((await f.pool()).remainingQuantity.toString()).toBe("100");
    expect((await f.machine()).status).toBe("IDLE");
    expect(await prisma.consumableAdjustment.findFirst({ where: { jobId: running.id, kind: "RELEASE" } })).not.toBeNull();
    expect(await prisma.usageLog.count({ where: { jobId: running.id } })).toBe(0);
  });
  it("bumps priority, reassigns before start, and keeps internal and requester notes out of audit/webhook bodies", async () => {
    const { job } = await f.submit();
    await f.act(job.id, { kind: "priority", priority: 5 });
    await f.act(job.id, { kind: "reassign", machineId: f.home.machine.id });
    await f.act(job.id, { kind: "note", body: "PRIVATE internal note", internal: true });
    await f.act(job.id, { kind: "note", body: "Requester update" }, {}, f.maker.id);
    await expect(f.act(job.id, { kind: "note", body: "Forbidden", internal: true }, {}, f.maker.id)).rejects.toThrow();
    expect(await f.readJob(job.id)).toMatchObject({ priority: 5, machineId: null, assignedMachineId: f.home.machine.id });
    expect(await prisma.jobNote.findMany({ where: { jobId: job.id } })).toHaveLength(2);
    expect(JSON.stringify(await prisma.auditEvent.findMany({ where: { targetId: job.id } }))).not.toContain("PRIVATE internal");
    const events = await prisma.jobEvent.findMany({ where: { jobId: job.id, kind: "noted" } });
    expect(events.every((e) => e.note === "")).toBe(true);
  });
  it("creates approved reprints with fresh numbers/tokens and references files from the root, including reprints of reprints", async () => {
    const submitted = await f.submit({ files: [{ filename: "file.pdf", body: Buffer.from("%PDF-1.7") }] });
    await f.act(submitted.job.id, { kind: "approve" });
    await f.act(submitted.job.id, { kind: "start" });
    await f.act(submitted.job.id, { kind: "complete", actualMinutes: 1 });
    const copy = await f.act(submitted.job.id, { kind: "reprint" });
    expect(copy.job).toMatchObject({ status: "APPROVED", reprintOfId: submitted.job.id, quotedAmount: 0, number: 2 });
    expect(copy.job.statusToken).not.toBe(submitted.job.statusToken);
    expect(await jobFilesForRequester(f.home.space.id, copy.job.id, f.maker.id)).toHaveLength(1);
    expect(await prisma.jobFile.count({ where: { jobId: copy.job.id } })).toBe(0);
    await f.act(copy.job.id, { kind: "start" });
    await f.act(copy.job.id, { kind: "fail", reason: "Failure", percent: 0, actualMinutes: 1 });
    expect((await f.act(copy.job.id, { kind: "reprint" })).job.reprintOfId).toBe(submitted.job.id);
  });
  it("rolls back usage, machine, stock, job, audit and outbox when an injected effect fails", async () => {
    const job = await f.running();
    const before = await prisma.auditEvent.count({ where: { spaceId: f.home.space.id } });
    const onCompleted = vi.fn(async () => { throw new Error("Payment hook failed"); });
    await expect(f.act(job.id, { kind: "complete", actualMinutes: 42, actualQuantity: "2" }, { payments: { ...freeJobPaymentEffects, onCompleted } })).rejects.toThrow("Payment hook failed");
    expect((await f.readJob(job.id)).status).toBe("RUNNING");
    expect(await f.machine()).toMatchObject({ status: "RUNNING", meterMinutes: 0, meterJobs: 0 });
    expect((await f.pool()).remainingQuantity.toString()).toBe("90");
    expect(await prisma.usageLog.count({ where: { jobId: job.id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { spaceId: f.home.space.id } })).toBe(before);
    expect(await prisma.jobEvent.count({ where: { jobId: job.id, kind: "completed" } })).toBe(0);
  });
  it("returns not found for a foreign job before attempting a transition", async () => {
    const { job } = await f.submit();
    await expect(transitionJob({ spaceId: f.away.space.id, actorId: f.away.user.id, jobId: job.id }, { kind: "approve" })).rejects.toThrow("Space not found");
    expect((await f.readJob(job.id)).status).toBe("SUBMITTED");
  });
});
