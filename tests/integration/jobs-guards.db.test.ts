import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { freeJobPaymentEffects } from "@/lib/jobs";
import { JobGuardError } from "@/lib/jobs/context";
import { jobsFixture, type JobsFixture } from "../helpers/jobs-db";

vi.mock("@/lib/webhooks/emit", async (original) => ({ ...await original<object>(), enqueueWebhookDeliveries: vi.fn() }));
let f: JobsFixture;
beforeEach(async () => { f = await jobsFixture(); });
afterEach(async () => { await f?.cleanup(); });

describe("job guards and injected payment effects", () => {
  it("refuses current rates in a different currency, allowing an explicit override or a fresh submission", async () => {
    await f.settings({ paymentsEnabled: true });
    const { job } = await f.submit();
    await prisma.space.update({ where: { id: job.spaceId }, data: { currency: job.currency === "USD" ? "INR" : "USD" } });
    await prisma.pricingRule.create({ data: { spaceId: job.spaceId, mode: "FLAT", flatFee: 1000 } });
    const onApproved = vi.fn();
    const deps = { payments: { ...freeJobPaymentEffects, onApproved } };
    await expect(f.act(job.id, { kind: "approve" }, deps)).rejects.toBeInstanceOf(JobGuardError);
    await expect(f.act(job.id, { kind: "approve" }, deps)).rejects.toThrow("Set a price override in the job currency or re-submit");
    expect(await f.readJob(job.id)).toMatchObject({ status: "SUBMITTED", quotedAmount: null, pricingSnapshot: null, currency: job.currency });
    expect(onApproved).not.toHaveBeenCalled();
    expect(await prisma.payment.count({ where: { jobId: job.id } })).toBe(0);
    expect(await prisma.jobEvent.count({ where: { jobId: job.id, kind: "approved" } })).toBe(0);
    const override = await f.act(job.id, { kind: "approve", priceOverride: 250, reason: "Agreed in original currency" }, deps);
    expect(override.job).toMatchObject({ status: "APPROVED", quotedAmount: 250, currency: job.currency });
    const fresh = await f.approve(deps);
    expect(fresh.quotedAmount).toBe(1000);
    expect(fresh.currency).not.toBe(job.currency);
  });
  it("blocks nonstaff, inactive staff, missing authenticators, and transitions from the wrong state", async () => {
    const { job } = await f.submit();
    await expect(f.act(job.id, { kind: "approve" }, {}, f.maker.id)).rejects.toThrow("cannot perform");
    await expect(f.act(job.id, { kind: "start" })).rejects.toThrow("Cannot start");
    await expect(f.act(job.id, { kind: "complete", actualMinutes: 1 })).rejects.toThrow("Cannot complete");
    await prisma.user.update({ where: { id: f.home.user.id }, data: { mfaEnabledAt: null } });
    await expect(f.act(job.id, { kind: "approve" })).rejects.toThrow("authenticator");
    await prisma.user.update({ where: { id: f.home.user.id }, data: { mfaEnabledAt: new Date() } });
    await prisma.spaceMember.updateMany({ where: { spaceId: f.home.space.id, userId: f.home.user.id }, data: { role: "VIEWER" } });
    await expect(f.act(job.id, { kind: "approve" })).rejects.toThrow("cannot perform");
    await expect(f.act(job.id, { kind: "note", body: "No write permission", internal: true })).rejects.toThrow("cannot add");
  });
  it("computes quotes with estimates, preserves rates for actuals, and runs effects inside the transaction", async () => {
    await f.settings({ paymentsEnabled: true, taxRateBps: 1800, taxInclusive: false });
    const rule = await prisma.pricingRule.create({ data: { spaceId: f.home.space.id, mode: "TIME_AND_MATERIAL", setupFee: 100,
      timeRatePerHour: 600, materialRate: "2.5", timeIncrementMinutes: 15 } });
    const onApproved = vi.fn(); const onCompleted = vi.fn();
    const deps = { payments: { ...freeJobPaymentEffects, onApproved, onCompleted, canStart: async () => true } };
    const { job } = await f.submit();
    await expect(f.act(job.id, { kind: "approve" }, deps)).rejects.toThrow("required");
    expect((await f.readJob(job.id)).status).toBe("SUBMITTED");
    const approved = await f.act(job.id, { kind: "approve", estimatedMinutes: 16, estimatedQuantity: "10" }, deps);
    expect(approved.job.quotedAmount).toBe(502); // (100 + 300 + 25) + round(76.5)
    expect(onApproved.mock.calls[0][1].status).toBe("APPROVED");
    await prisma.pricingRule.update({ where: { id: rule.id }, data: { timeRatePerHour: 99999 } });
    await f.act(job.id, { kind: "start", poolId: f.home.pool.id }, deps);
    const completed = await f.act(job.id, { kind: "complete", actualMinutes: 10, actualQuantity: "8" }, deps);
    expect(completed.job.finalAmount).toBe(319); // (100 + 150 + 20) + round(48.6)
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });
  it("defaults unpaid paid jobs to blocked at start and collection, and requires payments.manage plus a reason to override", async () => {
    await f.settings({ paymentsEnabled: true });
    await prisma.pricingRule.create({ data: { spaceId: f.home.space.id, mode: "FLAT", flatFee: 100, paymentTiming: "UPFRONT" } });
    const job = await f.approve();
    await expect(f.act(job.id, { kind: "start", poolId: f.home.pool.id })).rejects.toThrow("not paid");
    await expect(f.act(job.id, { kind: "start", poolId: f.home.pool.id, paymentOverrideReason: " " })).rejects.toThrow("reason");
    await prisma.spaceMember.updateMany({ where: { spaceId: f.home.space.id, userId: f.home.user.id }, data: { role: "OPERATOR" } });
    await expect(f.act(job.id, { kind: "start", poolId: f.home.pool.id, paymentOverrideReason: "Authorised" })).rejects.toThrow("payments.manage");
    await prisma.spaceMember.updateMany({ where: { spaceId: f.home.space.id, userId: f.home.user.id }, data: { role: "MACHINE_MANAGER" } });
    await f.act(job.id, { kind: "start", poolId: f.home.pool.id, paymentOverrideReason: "Invoice approved" });
    await f.act(job.id, { kind: "complete", actualMinutes: 10 });
    await expect(f.act(job.id, { kind: "collect" })).rejects.toThrow("not paid");
    await f.act(job.id, { kind: "collect", paymentOverrideReason: "Collection approved" });
    expect((await f.readJob(job.id)).status).toBe("COLLECTED");
    const startEvent = await prisma.jobEvent.findFirst({ where: { jobId: job.id, kind: "started" } });
    expect(startEvent).toMatchObject({ note: "Invoice approved", data: { paymentOverride: true } });
  });
  it("honours PAY_LATER and collection setting, with a clear gate hook for M3b", async () => {
    await f.settings({ paymentsEnabled: true });
    const rule = await prisma.pricingRule.create({ data: { spaceId: f.home.space.id, mode: "FLAT", flatFee: 100, paymentTiming: "PAY_LATER" } });
    const deps = { payments: { ...freeJobPaymentEffects, canStart: async () => true } };
    const job = await f.running(deps);
    await f.act(job.id, { kind: "complete", actualMinutes: 1 }, deps);
    await f.act(job.id, { kind: "collect" }, deps);
    await f.settings({ allowPayLater: false });
    const second = await f.submit();
    await expect(f.act(second.job.id, { kind: "approve" })).rejects.toThrow("Pay later");
    await prisma.pricingRule.update({ where: { id: rule.id }, data: { paymentTiming: "ON_COMPLETION" } });
    const third = await f.running(deps);
    await f.act(third.id, { kind: "complete", actualMinutes: 1 }, deps);
    await f.settings({ requirePaymentBeforeCollection: false });
    await f.act(third.id, { kind: "collect" });
  });
  it("requires a reason and money capability for a quote override", async () => {
    await f.settings({ paymentsEnabled: true });
    const { job } = await f.submit();
    await expect(f.act(job.id, { kind: "approve", priceOverride: 123 })).rejects.toThrow("reason");
    await prisma.spaceMember.updateMany({ where: { userId: f.home.user.id, spaceId: f.home.space.id }, data: { role: "OPERATOR" } });
    await expect(f.act(job.id, { kind: "approve", priceOverride: 123, reason: "Special price" })).rejects.toThrow("payments.manage");
    await prisma.spaceMember.updateMany({ where: { userId: f.home.user.id, spaceId: f.home.space.id }, data: { role: "MACHINE_MANAGER" } });
    expect((await f.act(job.id, { kind: "approve", priceOverride: 123, reason: "Special price" })).job).toMatchObject({ quotedAmount: 123, priceOverrideReason: "Special price" });
  });
  it("rejects invalid actuals and failure inputs without usage or pool changes", async () => {
    const job = await f.running();
    await expect(f.act(job.id, { kind: "fail", reason: "", percent: 10, actualMinutes: 1 })).rejects.toThrow("reason");
    await expect(f.act(job.id, { kind: "fail", reason: "Failure", percent: 101, actualMinutes: 1 })).rejects.toThrow("Percent");
    await expect(f.act(job.id, { kind: "complete", actualMinutes: -1 })).rejects.toThrow("non-negative");
    await expect(f.act(job.id, { kind: "complete", actualMinutes: 1, actualQuantity: "-1" })).rejects.toThrow("negative");
    expect((await f.readJob(job.id)).status).toBe("RUNNING");
    expect((await f.pool()).remainingQuantity.toString()).toBe("90");
    expect(await prisma.usageLog.count({ where: { jobId: job.id } })).toBe(0);
  });
  it("enforces machine availability, matching type, retirement, pool binding, units, material, colour and stock", async () => {
    const job = await f.approve();
    await expect(f.act(job.id, { kind: "start", machineId: f.away.machine.id })).rejects.toThrow("Space not found");
    await expect(f.act(job.id, { kind: "start" })).rejects.toThrow("pool");
    await expect(f.act(job.id, { kind: "start", poolId: f.away.pool.id })).rejects.toThrow("Pool not found");
    await expect(f.act(job.id, { kind: "start", poolId: f.home.pool.id, plannedQuantity: "101" })).rejects.toThrow("Not enough stock");
    await prisma.machine.update({ where: { id: f.home.machine.id }, data: { status: "OFFLINE" } });
    await expect(f.act(job.id, { kind: "start", poolId: f.home.pool.id })).rejects.toThrow("idle machine");
    await prisma.machine.update({ where: { id: f.home.machine.id }, data: { status: "IDLE" } });
    await prisma.consumablePool.update({ where: { id: f.home.pool.id }, data: { unit: "SHEETS" } });
    await expect(f.act(job.id, { kind: "start", poolId: f.home.pool.id })).rejects.toThrow("different consumable unit");
    await prisma.consumablePool.update({ where: { id: f.home.pool.id }, data: { unit: "GRAMS", isActive: false } });
    await expect(f.act(job.id, { kind: "start", poolId: f.home.pool.id })).rejects.toThrow("retired");
    await prisma.consumablePool.update({ where: { id: f.home.pool.id }, data: { isActive: true } });
    await f.type({ requestFields: [{ key: "material", label: "Material", kind: "material" }] });
    await prisma.job.update({ where: { id: job.id }, data: { requestData: { material: "ABS" } } });
    await expect(f.act(job.id, { kind: "start", poolId: f.home.pool.id })).rejects.toThrow("material or colour");
    expect((await f.machine()).status).toBe("IDLE");
    expect((await f.pool()).remainingQuantity.toString()).toBe("100");
  });
  it("treats printer start as best effort after commit", async () => {
    await prisma.printerConnection.create({ data: { spaceId: f.home.space.id, machineId: f.home.machine.id } });
    const job = await f.approve();
    const startPrinter = vi.fn(async () => {
      expect((await f.readJob(job.id)).status).toBe("RUNNING");
      throw new Error("Printer unreachable");
    });
    const result = await f.act(job.id, { kind: "start", poolId: f.home.pool.id }, { startPrinter });
    expect(startPrinter).toHaveBeenCalledTimes(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.job.status).toBe("RUNNING");
  });
  it("requires a compatible pool binding and colour, accepting an explicit no preference", async () => {
    const other = await prisma.machine.create({ data: { spaceId: f.home.space.id, typeId: f.home.type.id, slug: "other", name: "Other" } });
    const job = await f.approve();
    await prisma.consumablePool.update({ where: { id: f.home.pool.id }, data: { machineId: other.id } });
    await expect(f.act(job.id, { kind: "start", machineId: f.home.machine.id, poolId: f.home.pool.id })).rejects.toThrow("doesn't serve");
    await prisma.consumablePool.update({ where: { id: f.home.pool.id }, data: { machineId: null, typeId: f.home.type.id } });
    await f.type({ requestFields: [{ key: "colour", label: "Colour", kind: "colour" }] });
    await prisma.job.update({ where: { id: job.id }, data: { requestData: { colour: "Red" } } });
    await expect(f.act(job.id, { kind: "start", poolId: f.home.pool.id })).rejects.toThrow("material or colour");
    await prisma.job.update({ where: { id: job.id }, data: { requestData: { colour: "no preference" } } });
    expect((await f.act(job.id, { kind: "start", poolId: f.home.pool.id })).job.status).toBe("RUNNING");
  });
  it("rejects every state-changing command from an invalid lifecycle state", async () => {
    const job = await f.running();
    await f.act(job.id, { kind: "complete", actualMinutes: 1 });
    const commands = [
      { kind: "approve" }, { kind: "reject", reason: "reason" }, { kind: "cancel" }, { kind: "start" },
      { kind: "pause" }, { kind: "resume" }, { kind: "complete", actualMinutes: 1 },
      { kind: "fail", reason: "reason", percent: 0, actualMinutes: 1 }, { kind: "priority", priority: 1 },
      { kind: "reassign", machineId: null },
    ] as const;
    for (const command of commands) await expect(f.act(job.id, command)).rejects.toThrow("Cannot");
    const submitted = await f.submit();
    await expect(f.act(submitted.job.id, { kind: "collect" })).rejects.toThrow("Cannot collect");
    await expect(f.act(submitted.job.id, { kind: "reprint" })).rejects.toThrow("Cannot reprint");
  });
});
