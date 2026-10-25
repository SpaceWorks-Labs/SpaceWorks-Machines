import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { handBackRefund, processRefund } from "@/lib/payments/refunds";
import { paymentsFixture, timings, methods, type PaymentsFixture } from "../helpers/payments-db";

vi.mock("@/lib/webhooks/emit", async (original) => ({ ...await original<object>(), enqueueWebhookDeliveries: vi.fn() }));
let f: PaymentsFixture;
beforeEach(async () => { f = await paymentsFixture(); });
afterEach(async () => { await f?.cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("every timing × payment method × job outcome", () => {
  const cases = timings.flatMap((timing) => methods.flatMap((method) => ["complete", "reject", "cancel", "fail"].map((outcome) => ({ timing, method, outcome }))));
  it.each(cases)("$timing $method $outcome", async ({ timing, method, outcome }) => {
    await f.configure(timing);
    const job = await f.approve();
    const [first] = await f.payments(job);
    expect(first).toMatchObject({ kind: timing === "UPFRONT" ? "CHARGE" : "DEPOSIT", amount: timing === "UPFRONT" ? 1000 : 250, status: "PENDING" });
    await expect(f.act(job.id, { kind: "start" })).rejects.toThrow("not paid");
    await f.pay(first, method);
    if (outcome === "reject" || outcome === "cancel") {
      await f.act(job.id, outcome === "reject" ? { kind: "reject", reason: "Unsupported" } : { kind: "cancel", reason: "Requested" });
    } else {
      await f.act(job.id, { kind: "start" });
      await f.act(job.id, outcome === "complete" ? { kind: "complete", actualMinutes: 30 } : { kind: "fail", reason: "Failed", actualMinutes: 30, percent: 50 });
    }
    if (outcome === "complete") {
      const balance = (await f.payments(job)).find((p) => p.kind === "BALANCE");
      if (timing !== "UPFRONT") {
        expect(balance).toMatchObject({ amount: 750, status: "PENDING" });
        if (timing === "PAY_LATER") await f.act(job.id, { kind: "collect" });
        else await expect(f.act(job.id, { kind: "collect" })).rejects.toThrow("not paid");
        await f.pay(balance!, method);
      }
      if (timing !== "PAY_LATER") await f.act(job.id, { kind: "collect" });
      expect(await f.readJob(job.id)).toMatchObject({ status: "COLLECTED", amountPaid: 1000, paymentState: "PAID" });
      expect(await prisma.refund.count({ where: { spaceId: f.spaceId } })).toBe(0);
    } else {
      const refunds = await prisma.refund.findMany({ where: { spaceId: f.spaceId } });
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({ amount: first.amount, status: "PENDING", reason: outcome === "reject" ? "JOB_REJECTED" : outcome === "cancel" ? "JOB_CANCELLED" : "JOB_FAILED" });
      const context = { spaceId: f.spaceId, actorId: f.home.user.id, refundId: refunds[0].id };
      if (method === "RAZORPAY" || method === "STRIPE") await processRefund(context);
      else await handBackRefund(context, "Returned to maker");
      expect(await f.readJob(job.id)).toMatchObject({ amountPaid: first.amount, amountRefunded: first.amount, paymentState: "REFUNDED" });
    }
  });
});

describe("pricing audiences and actual prices feed payments", () => {
  it.each(timings.flatMap((timing) => ["complete", "reject", "cancel", "fail"].map((outcome) => ({ timing, outcome }))))("FREE $timing $outcome creates no money rows", async ({ timing, outcome }) => {
    await f.configure(timing, { mode: "FREE" });
    const job = await f.approve();
    if (outcome === "reject" || outcome === "cancel") await f.act(job.id, outcome === "reject" ? { kind: "reject", reason: "Reason" } : { kind: "cancel" });
    else {
      await f.act(job.id, { kind: "start" });
      await f.act(job.id, outcome === "complete" ? { kind: "complete", actualMinutes: 60 } : { kind: "fail", actualMinutes: 1, percent: 0, reason: "Failed" });
      if (outcome === "complete") await f.act(job.id, { kind: "collect" });
    }
    expect(await f.payments(job)).toEqual([]);
    expect(await prisma.refund.count({ where: { spaceId: f.spaceId } })).toBe(0);
    expect((await f.readJob(job.id)).paymentState).toBe("NOT_REQUIRED");
  });
  it.each(timings)("%s charges an increased final total less money already paid", async (timing) => {
    await f.configure(timing, { mode: "TIME", timeRatePerHour: 600 });
    const job = await f.approve(); const [first] = await f.payments(job);
    await f.pay(first, "CASH"); await f.act(job.id, { kind: "start" });
    await f.act(job.id, { kind: "complete", actualMinutes: 120 });
    const balance = (await f.payments(job)).find((p) => p.kind === "BALANCE")!;
    expect(balance.amount).toBe(1200 - first.amount);
    await f.pay(balance, "CASH"); await f.act(job.id, { kind: "collect" });
    expect(await f.readJob(job.id)).toMatchObject({ finalAmount: 1200, amountPaid: 1200, paymentState: "PAID" });
  });
  it.each(["FREE", "FLAT", "TIME", "MATERIAL", "TIME_AND_MATERIAL"] as const)("%s member and public", async (mode) => {
    await f.settings({ eligibility: "ANYONE" });
    await f.configure("ON_COMPLETION", { mode, depositMode: "NONE", flatFee: 1000, timeRatePerHour: 600, materialRate: "2" });
    await prisma.pricingRule.create({ data: { spaceId: f.spaceId, audience: "PUBLIC", mode, flatFee: 2000, timeRatePerHour: 1200, materialRate: "4" } });
    for (const [actorId, multiplier] of [[f.maker.id, 1], [f.outsider.id, 2]] as const) {
      const { job } = await f.submit({ actorId });
      await f.act(job.id, { kind: "approve", estimatedMinutes: 60, estimatedQuantity: "10" });
      await f.act(job.id, { kind: "start" });
      const completed = await f.act(job.id, { kind: "complete", actualMinutes: 30, actualQuantity: "5" });
      const base = mode === "FREE" ? 0 : mode === "FLAT" ? 1000 : mode === "TIME" ? 300 : mode === "MATERIAL" ? 10 : 310;
      expect(completed.job.finalAmount).toBe(base * multiplier);
      const rows = await f.payments(job);
      expect(rows).toHaveLength(mode === "FREE" ? 0 : 1);
      if (mode !== "FREE") { expect(rows[0].amount).toBe(base * multiplier); await f.pay(rows[0], "CASH"); }
      else expect(completed.job.paymentState).toBe("NOT_REQUIRED");
      await f.act(job.id, { kind: "collect" });
    }
  });
  it.each(timings)("disabled payments force FREE under %s", async (timing) => {
    await f.configure(timing);
    await f.settings({ paymentsEnabled: false });
    const job = await f.approve();
    await f.act(job.id, { kind: "start" });
    await f.act(job.id, { kind: "complete", actualMinutes: 60 });
    expect(await f.payments(job)).toEqual([]);
    expect(await f.readJob(job.id)).toMatchObject({ paymentState: "NOT_REQUIRED", quotedAmount: 0, finalAmount: 0 });
  });
});
