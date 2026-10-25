import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { razorpay } from "@/lib/payments/razorpay";
import { stripe } from "@/lib/payments/stripe";

const keys = { keyId: "rzp_test_key", secret: "secret", webhookSecret: "hook", testMode: true };
afterEach(() => vi.unstubAllGlobals());

describe("job provider requests", () => {
  it("Stripe sends mode, minor units, client reference, space/job metadata and per-attempt idempotency", async () => {
    const http = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.test/cs_1", expires_at: 1800000000 })));
    vi.stubGlobal("fetch", http);
    const result = await stripe.createCheckout(keys, { paymentId: "payment1", spaceId: "space1", reference: "job1", checkoutKey: "attempt2",
      amountMinor: 1234, currency: "INR", description: "Job J-0001", spaceName: "Test", customer: { name: "A", email: "a@example.test" }, successUrl: "https://example.test/job", cancelUrl: "https://example.test/job" });
    const [url, init] = http.mock.calls[0];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init.headers).toMatchObject({ "idempotency-key": "checkout-attempt2" });
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toMatchObject({ mode: "payment", client_reference_id: "payment1", "metadata[spaceId]": "space1",
      "metadata[jobId]": "job1", "line_items[0][price_data][unit_amount]": "1234", "line_items[0][price_data][currency]": "inr", success_url: "https://example.test/job" });
    expect(result).toMatchObject({ expiresAt: new Date(1800000000000) });
  });
  it.each(["RAZORPAY", "STRIPE"] as const)("%s refunds the original payment and carries the refund id", async (provider) => {
    const http = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ id: "re_1", status: provider === "STRIPE" ? "succeeded" : "processed" })));
    vi.stubGlobal("fetch", http);
    const result = await (provider === "STRIPE" ? stripe : razorpay).refund(keys, { gatewayPaymentId: "pay_123", amountMinor: 1234, currency: "INR", refundId: "refund1" });
    const [url, init] = http.mock.calls[0];
    expect(url).toBe(provider === "STRIPE" ? "https://api.stripe.com/v1/refunds" : "https://api.razorpay.com/v1/payments/pay_123/refund");
    expect(init.method).toBe("POST");
    const fields = provider === "STRIPE" ? Object.fromEntries(new URLSearchParams(String(init.body))) : JSON.parse(String(init.body));
    expect(fields).toMatchObject(provider === "STRIPE" ? { payment_intent: "pay_123", amount: "1234", "metadata[refundId]": "refund1" } : { amount: 1234, notes: { refundId: "refund1" } });
    expect(result).toEqual({ gatewayRefundId: "re_1", status: "processed" });
  });
  it("Razorpay link-paid payload maps the link reference and captured payment id", () => {
    expect(razorpay.parseEvent(JSON.stringify({ event: "payment_link.paid", created_at: 123, payload: {
      payment_link: { entity: { id: "plink_1", reference_id: "payment1", amount_paid: 1234, currency: "INR" } },
      payment: { entity: { id: "pay_1", method: "upi" } } } }), new Headers())).toMatchObject({ type: "captured", orderId: "plink_1", paymentId: "payment1", gatewayPaymentId: "pay_1", amountMinor: 1234, currency: "INR" });
  });
});
