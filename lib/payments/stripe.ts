import "server-only";

import { currencyExponent, isCurrencyCode } from "@/lib/money/currencies";
import { GatewayError, gatewayRequest, hmacHex, num, safeEqualHex, str, type PaymentGateway } from "./gateway";

const API = "https://api.stripe.com/v1";
const SIGNATURE_TOLERANCE_SECONDS = 300;

const bearer = (secret: string) => `Bearer ${secret}`;

function form(fields: Record<string, string | number>) {
  return new URLSearchParams(Object.entries(fields).map(([key, value]) => [key, String(value)])).toString();
}

function object(body: Record<string, unknown>): Record<string, unknown> {
  return ((body.data ?? {}) as { object?: Record<string, unknown> }).object ?? {};
}

function captured(eventId: string, session: Record<string, unknown>) {
  const metadata = (session.metadata ?? {}) as Record<string, unknown>;
  return {
    type: "captured" as const,
    eventId,
    orderId: str(session.id),
    paymentId: str(session.client_reference_id) ?? str(metadata.paymentId),
    gatewayPaymentId: str(session.payment_intent),
    amountMinor: num(session.amount_total),
    currency: (str(session.currency) ?? "").toUpperCase(),
    method: null,
  };
}

/** Stripe Checkout Sessions (mode: payment) by redirect, on the space's own Stripe account. */
function stripeRefund(refund: Record<string, unknown>) {
  const status = refund.status === "succeeded" ? "processed" as const : refund.status === "failed" || refund.status === "canceled" ? "failed" as const : "pending" as const;
  return { gatewayRefundId: str(refund.id) ?? "", status };
}

export const stripe: PaymentGateway = {
  async createCheckout(credentials, request) {
    if (isCurrencyCode(request.currency) && currencyExponent(request.currency) === 3 && request.amountMinor % 10 !== 0) {
      throw new GatewayError("Stripe takes three-decimal currencies only in multiples of 10 fils or baisa.", 400, false);
    }
    const session = await gatewayRequest(`${API}/checkout/sessions`, {
      method: "POST",
      auth: bearer(credentials.secret),
      contentType: "application/x-www-form-urlencoded",
      idempotencyKey: `checkout-${request.checkoutKey ?? request.paymentId}`,
      body: form({
        mode: "payment",
        client_reference_id: request.paymentId,
        customer_email: request.customer.email,
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": request.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": request.amountMinor,
        "line_items[0][price_data][product_data][name]": request.description.slice(0, 250),
        "metadata[paymentId]": request.paymentId,
        "metadata[spaceId]": request.spaceId,
        "metadata[jobId]": request.reference ?? "",
        "payment_intent_data[metadata][paymentId]": request.paymentId,
      }),
    });
    const orderId = str(session.id);
    const url = str(session.url);
    if (!orderId || !url) throw new Error("Stripe did not return a checkout session.");
    return { kind: "redirect", orderId, url, ...(num(session.expires_at) ? { expiresAt: new Date(num(session.expires_at) * 1000) } : {}) };
  },

  verifyWebhook(credentials, rawBody, headers, now = new Date()) {
    const header = headers.get("stripe-signature") ?? "";
    if (!credentials.webhookSecret || !header) return false;
    const parts = header.split(",").map((part) => part.split("=") as [string, string]);
    const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
    if (!Number.isFinite(timestamp) || Math.abs(now.getTime() / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
    const expected = hmacHex(credentials.webhookSecret, `${timestamp}.${rawBody}`);
    return parts.some(([key, value]) => key === "v1" && safeEqualHex(value ?? "", expected));
  },

  parseEvent(rawBody) {
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const eventId = str(body.id) ?? "";
    const data = object(body);
    switch (body.type) {
      case "checkout.session.completed":
        return data.payment_status === "paid" ? captured(eventId, data) : { type: "ignored", eventId };
      case "checkout.session.async_payment_succeeded":
        return captured(eventId, data);
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const metadata = (data.metadata ?? {}) as Record<string, unknown>;
        return { type: "failed", eventId, orderId: str(data.id), paymentId: str(data.client_reference_id) ?? str(metadata.paymentId), reason: body.type === "checkout.session.expired" ? "Checkout expired" : "Payment failed" };
      }
      case "refund.created":
      case "refund.updated":
      case "refund.failed": {
        const id = str(data.id) ?? "";
        const refundId = str(((data.metadata ?? {}) as Record<string, unknown>).refundId);
        if (data.status === "succeeded") return { type: "refund-processed", eventId, gatewayRefundId: id, refundId, amountMinor: num(data.amount) };
        if (data.status === "failed" || data.status === "canceled") return { type: "refund-failed", eventId, gatewayRefundId: id, refundId, reason: str(data.failure_reason) ?? "The refund failed at Stripe" };
        return { type: "ignored", eventId };
      }
      default:
        return { type: "ignored", eventId };
    }
  },

  async fetchPayment(credentials, orderId) {
    const session = await gatewayRequest(`${API}/checkout/sessions/${encodeURIComponent(orderId)}`, { method: "GET", auth: bearer(credentials.secret) });
    if (session.payment_status === "paid") {
      const event = captured("", session);
      return { status: "paid", gatewayPaymentId: event.gatewayPaymentId, amountMinor: event.amountMinor, currency: event.currency, method: null };
    }
    if (session.status === "expired") return { status: "failed", reason: "Checkout expired" };
    return { status: "pending" };
  },

  async refund(credentials, args) {
    const refund = await gatewayRequest(`${API}/refunds`, {
      method: "POST",
      auth: bearer(credentials.secret),
      contentType: "application/x-www-form-urlencoded",
      idempotencyKey: `refund-${args.refundId}`,
      body: form({ payment_intent: args.gatewayPaymentId, amount: args.amountMinor, "metadata[refundId]": args.refundId }),
    });
    return stripeRefund(refund);
  },

  async fetchRefund(credentials, args) {
    const key = bearer(credentials.secret);
    if (args.gatewayRefundId) return stripeRefund(await gatewayRequest(`${API}/refunds/${encodeURIComponent(args.gatewayRefundId)}`, { method: "GET", auth: key }));
    const list = await gatewayRequest(`${API}/refunds?payment_intent=${encodeURIComponent(args.gatewayPaymentId)}&limit=100`, { method: "GET", auth: key });
    const items = Array.isArray(list.data) ? (list.data as Array<Record<string, unknown>>) : [];
    const match = items.find((item) => ((item.metadata ?? {}) as Record<string, unknown>).refundId === args.refundId);
    return match ? stripeRefund(match) : null;
  },

  async testConnection(credentials) {
    try {
      await gatewayRequest(`${API}/balance`, { method: "GET", auth: bearer(credentials.secret) });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Stripe rejected the key." };
    }
  },
};
