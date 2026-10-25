import { randomUUID } from "node:crypto";
import type { Refund } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createJobCheckout } from "@/lib/payments/jobs";
import { createRefund, handBackRefund, processRefund } from "@/lib/payments/refunds";
import { paymentsFixture, timings, methods, type PaymentsFixture } from "../helpers/payments-db";

vi.mock("@/lib/webhooks/emit", async (original) => ({ ...await original<object>(), enqueueWebhookDeliveries: vi.fn() }));
let f: PaymentsFixture;
beforeEach(async () => { f = await paymentsFixture(); });
afterEach(async () => { await f?.cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const refundContext = (refund: Refund) => ({ spaceId: f.spaceId, actorId: f.home.user.id, refundId: refund.id });
async function issue(refund: Refund, online: boolean) {
  return online ? processRefund(refundContext(refund)) : handBackRefund(refundContext(refund), "Receipt returned");
}

describe("refund policies for every timing and outcome, online and offline", () => {
  const cases = timings.flatMap((timing) => ["RAZORPAY", "STRIPE", "CASH"].flatMap((method) =>
    ["reject", "cancel", "fail"].flatMap((outcome) => ["FULL", "PERCENT", "NONE", "MANUAL"].map((rule) => ({ timing, method, outcome, rule }))))) as
    { timing: typeof timings[number]; method: "RAZORPAY" | "STRIPE" | "CASH"; outcome: "reject" | "cancel" | "fail"; rule: "FULL" | "PERCENT" | "NONE" | "MANUAL" }[];
  it.each(cases)("$timing $method $outcome $rule", async ({ timing, method, outcome, rule }) => {
    await f.configure(timing);
    await f.settings({ refundOnReject: rule, refundOnRejectPercent: 50, refundOnCancel: rule, refundOnCancelPercent: 50, refundOnFailure: rule, refundOnFailurePercent: 50 });
    const job = await f.approve(); const [p] = await f.payments(job);
    await f.pay(p, method);
    if (outcome === "fail") { await f.act(job.id, { kind: "start" }); await f.act(job.id, { kind: "fail", reason: "Failure", actualMinutes: 1, percent: 0 }); }
    else await f.act(job.id, outcome === "reject" ? { kind: "reject", reason: "Rejected" } : { kind: "cancel" });
    let refunds = await prisma.refund.findMany({ where: { spaceId: f.spaceId } });
    if (rule === "NONE" || rule === "MANUAL") expect(refunds).toHaveLength(0);
    if (rule === "MANUAL") refunds = [await createRefund(f.context(p.id), { amount: p.amount / 2, reason: "GOODWILL", note: "Staff decision" })];
    if (rule !== "NONE") {
      expect(refunds).toHaveLength(1);
      expect(refunds[0].amount).toBe(rule === "FULL" ? p.amount : p.amount / 2);
      const completed = await issue(refunds[0], method !== "CASH");
      expect(completed.status).toBe("SUCCEEDED");
      expect(await f.readJob(job.id)).toMatchObject({ amountRefunded: refunds[0].amount, paymentState: rule === "FULL" ? "REFUNDED" : "PARTIALLY_REFUNDED" });
    }
  });
});

describe("overpayments, caps, gateway refunds and late events", () => {
  it.each(timings.flatMap((timing) => methods.map((method) => ({ timing, method }))))("$timing $method overpayment proposes only the excess", async ({ timing, method }) => {
    await f.configure(timing, { mode: "TIME", timeRatePerHour: 600, depositMode: "FIXED", depositValue: 600 });
    const job = await f.approve(); const [p] = await f.payments(job);
    await f.pay(p, method); await f.act(job.id, { kind: "start" });
    await f.act(job.id, { kind: "complete", actualMinutes: 30 });
    expect(await f.readJob(job.id)).toMatchObject({ finalAmount: 300, amountPaid: 600 });
    const refunds = await prisma.refund.findMany({ where: { spaceId: f.spaceId } });
    expect(refunds).toEqual([expect.objectContaining({ reason: "OVERPAYMENT", amount: 300, status: "PENDING" })]);
    expect((await f.payments(job)).filter((p) => p.kind === "BALANCE")).toHaveLength(0);
    await issue(refunds[0], method === "STRIPE" || method === "RAZORPAY");
    await f.act(job.id, { kind: "collect" });
    expect((await f.readJob(job.id)).amountRefunded).toBe(300);
  });
  it("reserves pending refunds and serialises simultaneous proposals", async () => {
    await f.configure("UPFRONT"); const job = await f.approve(); const [p] = await f.payments(job); await f.pay(p, "CASH");
    const results = await Promise.allSettled([1, 2].map(() => createRefund(f.context(p.id), { amount: 600, reason: "OTHER", note: "Correction" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const remaining = await createRefund(f.context(p.id), { reason: "OTHER", note: "Remainder" });
    expect(remaining.amount).toBe(400);
    await expect(createRefund(f.context(p.id), { amount: 1, reason: "OTHER", note: "Too much" })).rejects.toThrow("exceed");
    const refunds = await prisma.refund.findMany({ where: { spaceId: f.spaceId } });
    for (const refund of refunds) await handBackRefund(refundContext(refund), "Returned");
    await handBackRefund(refundContext(remaining), "Duplicate command");
    expect((await f.readJob(job.id)).amountRefunded).toBe(1000);
  });
  it.each(["STRIPE", "RAZORPAY"] as const)("%s refunds recover lost responses, and duplicate success/failure events cannot double-refund", async (method) => {
    await f.configure("UPFRONT"); const job = await f.approve(); const [p] = await f.payments(job); await f.pay(p, method);
    const refund = await createRefund(f.context(p.id), { amount: 300, reason: "GOODWILL", note: "Partial refund" });
    f.network.loseNext();
    expect(await processRefund(refundContext(refund))).toMatchObject({ status: "PENDING", viaGateway: true });
    const recovered = await processRefund(refundContext(refund));
    expect(recovered.status).toBe("SUCCEEDED");
    expect(f.network.refunds.size).toBe(1);
    const refundBody = (failed: boolean) => method === "STRIPE" ? { id: `evt_${randomUUID()}`, type: "refund.updated", data: { object: {
      id: recovered.providerRefundId, amount: refund.amount, status: failed ? "failed" : "succeeded", metadata: { refundId: refund.id } } } } :
      { event: failed ? "refund.failed" : "refund.processed", created_at: Math.floor(Date.now() / 1000), payload: { refund: { entity: {
        id: recovered.providerRefundId, amount: refund.amount, notes: { refundId: refund.id } } } } };
    await f.signed(method, refundBody(false)); await f.signed(method, refundBody(true));
    expect((await f.readJob(job.id)).amountRefunded).toBe(300);
    expect(await prisma.auditEvent.count({ where: { targetId: p.id, action: "payment.refunded" } })).toBe(1);
  });
  it.each(["STRIPE", "RAZORPAY"] as const)("%s waits for pending refunds, handles provider failures and emits payment.refunded", async (method) => {
    await f.configure("UPFRONT"); const job = await f.approve(); const [p] = await f.payments(job); await f.pay(p, method);
    const endpoint = await prisma.webhookEndpoint.create({ data: { spaceId: f.spaceId, url: "https://example.test/hook", secretEncrypted: "unused", events: ["payment.refunded"] } });
    const refund = await createRefund(f.context(p.id), { amount: 300, reason: "GOODWILL", note: "Partial" });
    f.network.refundStatus("pending");
    const pending = await processRefund(refundContext(refund));
    expect(pending.status).toBe("PENDING"); expect((await f.readJob(job.id)).amountRefunded).toBe(0);
    await f.signed(method, method === "STRIPE" ? { id: `evt_${randomUUID()}`, type: "refund.updated", data: { object: { id: pending.providerRefundId,
      amount: 300, status: "succeeded", metadata: { refundId: refund.id } } } } : { event: "refund.processed", created_at: Math.floor(Date.now() / 1000),
      payload: { refund: { entity: { id: pending.providerRefundId, amount: 300, notes: { refundId: refund.id } } } } });
    expect((await f.readJob(job.id)).amountRefunded).toBe(300);
    expect(await prisma.webhookDelivery.count({ where: { endpointId: endpoint.id, event: "payment.refunded" } })).toBe(1);
    const second = await createRefund(f.context(p.id), { amount: 100, reason: "OTHER", note: "Second" });
    f.network.failNext(); expect((await processRefund(refundContext(second))).status).toBe("FAILED");
    expect((await f.readJob(job.id)).amountRefunded).toBe(300);
  });
  it("proposes policy refunds for captures received after cancellation", async () => {
    await f.configure("UPFRONT"); await f.gateway("STRIPE");
    const job = await f.approve(); const [p] = await f.payments(job);
    const payment = await createJobCheckout(f.context(p.id));
    await f.act(job.id, { kind: "cancel" });
    await f.signed("STRIPE", f.stripeBody(payment));
    expect(await prisma.refund.findFirst({ where: { paymentId: p.id } })).toMatchObject({ amount: 1000, reason: "JOB_CANCELLED" });
  });
  it("validates manual refund reasons, tenancy, permissions, and paid state", async () => {
    await f.configure("UPFRONT"); const job = await f.approve(); const [p] = await f.payments(job);
    const input = { amount: 10, reason: "OTHER" as const, note: "Reason" };
    await expect(createRefund(f.context(p.id), input)).rejects.toThrow("Only paid");
    await f.pay(p, "CASH");
    await expect(createRefund(f.context(p.id), { ...input, note: "" })).rejects.toThrow("reason");
    await expect(createRefund(f.context(p.id, f.maker.id), input)).rejects.toThrow("Space not found");
    await expect(createRefund({ ...f.context(p.id), spaceId: f.away.space.id }, input)).rejects.toThrow("Space not found");
    for (const amount of [0, -1, 1.5, 1001]) await expect(createRefund(f.context(p.id), { ...input, amount })).rejects.toThrow();
    const refund = await createRefund(f.context(p.id), input);
    await expect(processRefund(refundContext(refund))).rejects.toThrow("handed back");
  });
});
