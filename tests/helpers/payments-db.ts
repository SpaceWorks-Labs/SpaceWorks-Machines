import { createHmac, randomUUID } from "node:crypto";
import type { Job, Payment, PaymentMethod, PaymentTiming, Prisma } from "@prisma/client";
import { expect, vi } from "vitest";
import { prisma } from "@/lib/db";
import { savePaymentKeys } from "@/lib/payments/config";
import { createJobCheckout, recordOfflinePayment } from "@/lib/payments/jobs";
import { handleWebhook } from "@/lib/payments/webhooks";
import { jobsFixture } from "./jobs-db";

export const methods = ["RAZORPAY", "STRIPE", "CASH", "UPI", "BANK_TRANSFER", "CARD_TERMINAL", "OTHER"] as const;
export const timings = ["UPFRONT", "ON_COMPLETION", "PAY_LATER"] as const;

/** Only provider HTTP is replaced; the real adapters, signatures and SQL settlement run. */
export function providerHttp() {
  const links = new Map<string, Record<string, unknown>>();
  const sessions = new Map<string, Record<string, unknown>>();
  const refunds = new Map<string, Record<string, unknown>>();
  let refundStatus = "processed";
  let failNext = false;
  let loseNext = false;
  const http = vi.fn(async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const post = init.method === "POST";
    const stripe = u.hostname === "api.stripe.com";
    const fields = stripe ? Object.fromEntries(new URLSearchParams(String(init.body ?? ""))) : JSON.parse(String(init.body ?? "{}"));
    let response: Record<string, unknown>;
    if (failNext) { failNext = false; return new Response(JSON.stringify({ error: { message: "Provider rejected request" } }), { status: 400 }); }
    if (u.pathname === "/v1/payment_links" && !post) response = { payment_links: [...links.values()].filter((link) =>
      u.searchParams.has("payment_id") ? `pay_${link.reference_id}` === u.searchParams.get("payment_id") : link.reference_id === u.searchParams.get("reference_id")) };
    else if (u.pathname === "/v1/payment_links" && post) {
      const existing = links.get(fields.reference_id);
      if (existing) return new Response("{}", { status: 400 }); // Provider enforces reference_id uniqueness.
      const id = `plink_${randomUUID()}`;
      response = { id, short_url: `https://rzp.io/${id}`, ...fields };
      links.set(fields.reference_id, response);
    } else if (u.pathname === "/v1/checkout/sessions" && post) {
      const key = (init.headers as Record<string, string>)["idempotency-key"];
      response = sessions.get(key) ?? { id: `cs_${randomUUID()}`, url: `https://checkout.stripe.test/${randomUUID()}`,
        expires_at: Math.floor(Date.now() / 1000) + 3600, status: "open", ...fields };
      sessions.set(key, response);
    } else if (u.pathname.startsWith("/v1/checkout/sessions/") && !post) {
      response = [...sessions.values()].find((s) => s.id === u.pathname.split("/").at(-1)) ?? {};
    } else if (post && (u.pathname === "/v1/refunds" || u.pathname.endsWith("/refund"))) {
      const id = `ref_${randomUUID()}`;
      const refundId = stripe ? fields["metadata[refundId]"] : fields.notes.refundId;
      response = refunds.get(refundId) ?? { id, status: stripe && refundStatus === "processed" ? "succeeded" : refundStatus,
        amount: Number(fields.amount), metadata: { refundId }, notes: { refundId } };
      refunds.set(refundId, response);
    } else if (!post && u.pathname.endsWith("/refunds")) response = { data: [...refunds.values()], items: [...refunds.values()] };
    else if (!post && u.pathname.startsWith("/v1/refunds/")) response = [...refunds.values()].find((r) => r.id === u.pathname.split("/").at(-1)) ?? {};
    else throw new Error(`Unexpected provider HTTP ${init.method} ${url}`);
    if (loseNext && post) { loseNext = false; throw new Error("Response lost after provider accepted request"); }
    return new Response(JSON.stringify(response), { status: 200 });
  });
  vi.stubGlobal("fetch", http);
  return { http, links, sessions, refunds,
    failNext: () => { failNext = true; }, loseNext: () => { loseNext = true; }, refundStatus: (status: string) => { refundStatus = status; } };
}

export async function paymentsFixture() {
  vi.stubEnv("PAYMENT_SECRETS_KEY", Buffer.alloc(32, 17).toString("base64"));
  const f = await jobsFixture();
  const network = providerHttp();
  const spaceId = f.home.space.id;
  await f.type({ consumableUnit: null });
  await f.settings({ paymentsEnabled: true, onlineMethods: ["RAZORPAY", "STRIPE"], offlineMethods: ["CASH", "UPI", "BANK_TRANSFER", "CARD_TERMINAL", "OTHER"] });
  const rule = await prisma.pricingRule.create({ data: { spaceId, mode: "FLAT", flatFee: 1000 } });
  async function gateway(method: PaymentMethod) {
    if (method === "RAZORPAY" || method === "STRIPE") await savePaymentKeys(spaceId, { provider: method,
      keyId: "rzp_test_key", secret: "sk_test_secret", webhookSecret: "hook_secret", testMode: true });
  }
  const context = (paymentId: string, actorId = f.home.user.id) => ({ spaceId, actorId, paymentId });
  async function signed(provider: "STRIPE" | "RAZORPAY", body: object) {
    const settings = await prisma.spacePaymentSettings.findUniqueOrThrow({ where: { spaceId } });
    const raw = JSON.stringify(body);
    const t = Math.floor(Date.now() / 1000);
    const digest = (value: string) => createHmac("sha256", "hook_secret").update(value).digest("hex");
    const headers = new Headers(provider === "STRIPE" ? { "stripe-signature": `t=${t},v1=${digest(`${t}.${raw}`)}` } : { "x-razorpay-signature": digest(raw) });
    return handleWebhook(provider, settings.webhookPublicCode, raw, headers);
  }
  const stripeBody = (payment: Payment, type = "checkout.session.completed", overrides: Record<string, unknown> = {}) => ({ id: `evt_${randomUUID()}`, type,
    data: { object: { id: payment.providerOrderId, client_reference_id: payment.id, payment_intent: `pi_${payment.id}`, payment_status: "paid",
      amount_total: payment.amount, currency: payment.currency.toLowerCase(), ...overrides } } });
  const razorBody = (payment: Payment, event = "payment_link.paid", overrides: Record<string, unknown> = {}) => ({ event, created_at: Math.floor(Date.now() / 1000),
    payload: { payment_link: { entity: { id: payment.providerOrderId, reference_id: payment.id, amount_paid: payment.amount, currency: payment.currency } },
      payment: { entity: { id: `pay_${payment.id}`, order_id: "order_underlying", notes: { paymentId: payment.id }, amount: payment.amount, currency: payment.currency, method: "upi", ...overrides } } } });
  async function pay(payment: Payment, method: PaymentMethod) {
    if (method === "RAZORPAY" || method === "STRIPE") {
      await gateway(method);
      const checkout = await createJobCheckout(context(payment.id, f.maker.id));
      expect(await signed(method, method === "STRIPE" ? stripeBody(checkout) : razorBody(checkout))).toMatchObject({ status: 200, body: "OK" });
    } else await recordOfflinePayment(context(payment.id), { method, reference: `Receipt ${randomUUID()}` });
    return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  }
  const payments = (job: Job) => prisma.payment.findMany({ where: { spaceId, jobId: job.id }, orderBy: { createdAt: "asc" } });
  const configure = (timing: PaymentTiming, data: Prisma.PricingRuleUpdateInput = {}) => prisma.pricingRule.update({ where: { id: rule.id }, data: {
    paymentTiming: timing, depositMode: timing === "UPFRONT" ? "NONE" : "PERCENT", depositValue: 2500, ...data } });
  return { ...f, network, rule, spaceId, context, gateway, signed, stripeBody, razorBody, pay, payments, configure,
    async cleanup() {
      await prisma.refund.deleteMany({ where: { spaceId } });
      await prisma.processedWebhookEvent.deleteMany({ where: { spaceId } });
      await f.cleanup();
    } };
}
export type PaymentsFixture = Awaited<ReturnType<typeof paymentsFixture>>;
