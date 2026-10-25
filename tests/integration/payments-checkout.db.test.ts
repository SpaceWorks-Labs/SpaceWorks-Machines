import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createJobCheckout, recordOfflinePayment, waivePayment } from "@/lib/payments/jobs";
import { stripe } from "@/lib/payments/stripe";
import { paymentsFixture, timings, type PaymentsFixture } from "../helpers/payments-db";

vi.mock("@/lib/webhooks/emit", async (original) => ({ ...await original<object>(), enqueueWebhookDeliveries: vi.fn() }));
let f: PaymentsFixture;
beforeEach(async () => { f = await paymentsFixture(); await f.configure("UPFRONT"); });
afterEach(async () => { await f?.cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function checkout(provider: "STRIPE" | "RAZORPAY" = "STRIPE") {
  await f.gateway(provider);
  const job = await f.approve();
  const [payment] = await f.payments(job);
  const context = f.context(payment.id, f.maker.id);
  return { job, payment: await createJobCheckout(context), context };
}

describe("online checkout, signatures and row-locked settlement", () => {
  it.each(["STRIPE", "RAZORPAY"] as const)("%s concurrent Pay now reuses one checkout", async (provider) => {
    await f.gateway(provider);
    const job = await f.approve(); const [p] = await f.payments(job);
    const context = f.context(p.id, f.maker.id);
    const results = await Promise.all([createJobCheckout(context), createJobCheckout(context), createJobCheckout(context)]);
    expect(new Set(results.map((r) => r.providerOrderId)).size).toBe(1);
    expect(f.network.http.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
    expect(await prisma.payment.count({ where: { jobId: job.id } })).toBe(1);
  });
  it.each(["STRIPE", "RAZORPAY"] as const)("%s recovers a checkout response lost after provider creation", async (provider) => {
    await f.gateway(provider);
    const job = await f.approve(); const [p] = await f.payments(job);
    f.network.loseNext();
    await expect(createJobCheckout(f.context(p.id))).rejects.toThrow("could not be reached");
    const before = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(before.checkoutKey).toBeTruthy();
    const recovered = await createJobCheckout(f.context(p.id));
    expect(recovered.checkoutKey).toBe(before.checkoutKey);
    expect(provider === "STRIPE" ? f.network.sessions.size : f.network.links.size).toBe(1);
  });
  it.each(timings)("%s replaces expired Stripe checkout and ignores stale expiry", async (timing) => {
    await f.configure(timing);
    const { payment, context } = await checkout();
    const expired = f.stripeBody(payment, "checkout.session.expired");
    await f.signed("STRIPE", expired);
    const next = await createJobCheckout(context);
    expect(next.providerOrderId).not.toBe(payment.providerOrderId);
    expect(next.checkoutKey).not.toBe(payment.checkoutKey);
    await f.signed("STRIPE", { ...expired, id: `evt_${randomUUID()}` });
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({ status: "PENDING", providerOrderId: next.providerOrderId, checkoutKey: next.checkoutKey });
    expect((await f.signed("STRIPE", f.stripeBody(next))).status).toBe(200);
  });
  it("reconciles time-expired Stripe sessions before replacing them", async () => {
    const { payment, context } = await checkout();
    await prisma.payment.update({ where: { id: payment.id }, data: { checkoutExpiresAt: new Date(0) } });
    expect((await createJobCheckout(context)).providerOrderId).toBe(payment.providerOrderId); // Provider still open.
    for (const session of f.network.sessions.values()) session.status = "expired";
    expect((await createJobCheckout(context)).providerOrderId).not.toBe(payment.providerOrderId);
  });
  it.each(timings)("%s replaces terminal Stripe async failures and ignores stale failures", async (timing) => {
    await f.configure(timing);
    const { payment, context } = await checkout();
    const failed = f.stripeBody(payment, "checkout.session.async_payment_failed", { payment_status: "unpaid" });
    expect(await f.signed("STRIPE", failed)).toMatchObject({ status: 200, body: "OK" });
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({ status: "FAILED", checkoutKey: null, checkoutUrl: null, checkoutStartedAt: null });
    const next = await createJobCheckout(context);
    expect(next.providerOrderId).not.toBe(payment.providerOrderId);
    expect(next.checkoutKey).not.toBe(payment.checkoutKey);
    await f.signed("STRIPE", { ...failed, id: `evt_${randomUUID()}` });
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({ status: "PENDING", checkoutKey: next.checkoutKey, checkoutUrl: next.checkoutUrl });
    await f.signed("STRIPE", f.stripeBody(next, "checkout.session.async_payment_succeeded"));
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({ status: "PAID" });
  });
  it.each(["offline", "waiver"])("allows %s after terminal Stripe async failure", async (method) => {
    const { payment } = await checkout();
    await f.signed("STRIPE", f.stripeBody(payment, "checkout.session.async_payment_failed", { payment_status: "unpaid" }));
    const context = f.context(payment.id);
    const result = method === "offline" ? await recordOfflinePayment(context, { method: "CASH", reference: "Receipt" }) : await waivePayment(context, "Courtesy");
    expect(result.status).toBe(method === "offline" ? "PAID" : "WAIVED");
  });
  it.each(["STRIPE", "RAZORPAY"] as const)("%s settles once after disabled payments and rejects late failure", async (provider) => {
    const { job, payment } = await checkout(provider);
    const endpoint = await prisma.webhookEndpoint.create({ data: { spaceId: f.spaceId, url: "https://example.test/hook", secretEncrypted: "unused", events: ["payment.paid"] } });
    await prisma.chatChannel.create({ data: { spaceId: f.spaceId, name: "Payment notices", kind: "SLACK", configEncrypted: "unused", events: ["job-payment"] } });
    await f.settings({ paymentsEnabled: false });
    const body = provider === "STRIPE" ? f.stripeBody(payment) : f.razorBody(payment);
    const results = await Promise.all([f.signed(provider, body), f.signed(provider, body)]);
    expect(results.map((r) => r.body).sort()).toEqual(["Duplicate", "OK"]);
    await f.signed(provider, provider === "STRIPE" ? f.stripeBody(payment, "checkout.session.expired") : f.razorBody(payment, "payment.failed"));
    expect(await f.readJob(job.id)).toMatchObject({ amountPaid: 1000, paymentState: "PAID" });
    expect(await prisma.auditEvent.count({ where: { targetId: payment.id, action: "payment.paid" } })).toBe(1);
    expect(await prisma.webhookDelivery.count({ where: { endpointId: endpoint.id, event: "payment.paid" } })).toBe(1);
    const chat = await prisma.outboxMessage.findMany({ where: { kind: "chat-notice" } });
    expect(chat.filter((row) => (row.payload as { spaceId?: string }).spaceId === f.spaceId)).toHaveLength(1);
    const notices = await prisma.outboxMessage.findMany({ where: { kind: { in: ["job-requester", "job-staff"] } } });
    expect(notices.filter((row) => (row.payload as { jobId?: string; event?: string }).jobId === job.id && (row.payload as { event?: string }).event === "payment")).toHaveLength(2);
  });
  it("settles Razorpay capture and link-paid in either order without double credit", async () => {
    const { payment, job } = await checkout("RAZORPAY");
    await f.signed("RAZORPAY", f.razorBody(payment, "payment.captured"));
    await f.signed("RAZORPAY", f.razorBody(payment));
    expect((await f.readJob(job.id)).amountPaid).toBe(1000);
  });
  it("resolves a Razorpay capture whose payment notes contain no link reference", async () => {
    const { payment, job } = await checkout("RAZORPAY");
    await f.signed("RAZORPAY", f.razorBody(payment, "payment.captured", { notes: {} }));
    expect((await f.readJob(job.id)).amountPaid).toBe(1000);
  });
  it("ignores unpaid Stripe completion until async success", async () => {
    const { payment, job } = await checkout();
    expect(await f.signed("STRIPE", f.stripeBody(payment, "checkout.session.completed", { payment_status: "unpaid" }))).toMatchObject({ body: "Ignored" });
    expect((await f.readJob(job.id)).amountPaid).toBe(0);
    await f.signed("STRIPE", f.stripeBody(payment, "checkout.session.async_payment_succeeded"));
    expect((await f.readJob(job.id)).amountPaid).toBe(1000);
  });
  it("rolls back mismatched capture and its idempotency row", async () => {
    const { payment, job } = await checkout();
    for (const fields of [{ amount_total: 999 }, { currency: "usd" }, { id: "cs_foreign" }]) {
      const body = f.stripeBody(payment, "checkout.session.completed", fields);
      await expect(f.signed("STRIPE", body)).rejects.toThrow("match");
      expect(await prisma.processedWebhookEvent.count({ where: { eventId: body.id } })).toBe(0);
    }
    expect((await f.readJob(job.id)).amountPaid).toBe(0);
  });
  it("rejects foreign payments, unauthorised actors, unconfigured/disabled methods and offline changes during checkout", async () => {
    const { payment, context } = await checkout();
    await expect(createJobCheckout({ ...context, spaceId: f.away.space.id })).rejects.toThrow("Space not found");
    await expect(createJobCheckout({ ...context, actorId: f.outsider.id })).rejects.toThrow("Space not found");
    await expect(recordOfflinePayment(f.context(payment.id), { method: "CASH", reference: "R" })).rejects.toThrow("checkout");
    await expect(waivePayment(f.context(payment.id), "Reason")).rejects.toThrow("checkout");
    await f.settings({ onlineMethods: [] });
    await expect(createJobCheckout(context)).rejects.toThrow("not enabled");
  });
  it("accepts injected gateway clients", async () => {
    await f.gateway("STRIPE"); const job = await f.approve(); const [p] = await f.payments(job);
    const createCheckout = vi.fn(stripe.createCheckout);
    await createJobCheckout(f.context(p.id), { STRIPE: { ...stripe, createCheckout } });
    expect(createCheckout).toHaveBeenCalledOnce();
  });
});
