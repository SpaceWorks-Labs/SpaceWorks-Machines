import "server-only";

import { gatewayRequest, hmacHex, num, safeEqualHex, str, type PaymentGateway } from "./gateway";

const API = "https://api.razorpay.com/v1";
/** Razorpay retries a failed webhook for up to 24 hours; allow a little more. */
const REPLAY_WINDOW_SECONDS = 36 * 3600;

function auth(keyId: string | null, secret: string) {
  if (!keyId) throw new Error("Razorpay needs a key id.");
  return `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`;
}

function entity(body: Record<string, unknown>, name: string): Record<string, unknown> {
  const payload = (body.payload ?? {}) as Record<string, { entity?: Record<string, unknown> }>;
  return payload[name]?.entity ?? {};
}

/** Payment Links redirect checkout. Webhooks are signed with the webhook secret. */
function razorpayRefund(refund: Record<string, unknown>) {
  const status = refund.status === "processed" ? "processed" as const : refund.status === "failed" ? "failed" as const : "pending" as const;
  return { gatewayRefundId: str(refund.id) ?? "", status };
}

export const razorpay: PaymentGateway = {
  async createCheckout(credentials, request) {
    const order = await gatewayRequest(`${API}/payment_links`, {
      method: "POST",
      auth: auth(credentials.keyId, credentials.secret),
      body: JSON.stringify({
        amount: request.amountMinor,
        currency: request.currency,
        reference_id: request.paymentId,
        accept_partial: false,
        description: request.description,
        customer: request.customer,
        callback_url: request.successUrl,
        callback_method: "get",
        notes: { paymentId: request.paymentId, spaceId: request.spaceId, jobId: request.reference ?? "" },
      }),
    });
    const orderId = str(order.id);
    const url = str(order.short_url);
    if (!orderId || !url) throw new Error("Razorpay did not return a payment link.");
    return { kind: "redirect", orderId, url, ...(num(order.expire_by) ? { expiresAt: new Date(num(order.expire_by) * 1000) } : {}) };
  },

  async findCheckout(credentials, paymentId) {
    const result = await gatewayRequest(`${API}/payment_links?reference_id=${encodeURIComponent(paymentId)}`, { method: "GET", auth: auth(credentials.keyId, credentials.secret) });
    const links = Array.isArray(result.payment_links) ? result.payment_links as Record<string, unknown>[] : [];
    const link = links.find((item) => item.reference_id === paymentId);
    if (!link) return null;
    if (!str(link.id) || !str(link.short_url)) throw new Error("Razorpay returned an invalid payment link.");
    return { kind: "redirect", orderId: String(link.id), url: String(link.short_url) };
  },

  async paymentReference(credentials, gatewayPaymentId) {
    const result = await gatewayRequest(`${API}/payment_links?payment_id=${encodeURIComponent(gatewayPaymentId)}`, { method: "GET", auth: auth(credentials.keyId, credentials.secret) });
    const links = Array.isArray(result.payment_links) ? result.payment_links as Record<string, unknown>[] : [];
    const link = links.length === 1 ? links[0] : null;
    return link && str(link.reference_id) && str(link.id) ? { paymentId: String(link.reference_id), orderId: String(link.id) } : null;
  },

  verifyWebhook(credentials, rawBody, headers, now = new Date()) {
    const signature = headers.get("x-razorpay-signature") ?? "";
    if (!credentials.webhookSecret || !signature) return false;
    if (!safeEqualHex(signature, hmacHex(credentials.webhookSecret, rawBody))) return false;
    // Razorpay signs no timestamp header; refuse signed bodies older than its retry window so a captured
    // request can't be replayed later.
    try {
      const created = num((JSON.parse(rawBody) as Record<string, unknown>).created_at);
      return created > 0 && created <= now.getTime() / 1000 + 300 && now.getTime() / 1000 - created < REPLAY_WINDOW_SECONDS;
    } catch {
      return false;
    }
  },

  parseEvent(rawBody, headers) {
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    // The event id header isn't covered by the signature, so de-duplication keys on the signed body only:
    // the event, its entity and when Razorpay created it.
    void headers;
    const eventId = `${str(body.event)}:${str(entity(body, "payment").id) ?? str(entity(body, "refund").id) ?? ""}:${num(body.created_at)}`;
    switch (body.event) {
      case "payment_link.paid": {
        const link = entity(body, "payment_link");
        const payment = entity(body, "payment");
        return { type: "captured", eventId, orderId: str(link.id), paymentId: str(link.reference_id), gatewayPaymentId: str(payment.id),
          amountMinor: num(link.amount_paid), currency: str(link.currency) ?? "", method: str(payment.method) };
      }
      case "payment.captured": {
        const payment = entity(body, "payment");
        const notes = (payment.notes ?? {}) as Record<string, unknown>;
        return { type: "captured", eventId, orderId: str(payment.order_id), paymentId: str(notes.paymentId), gatewayPaymentId: str(payment.id), amountMinor: num(payment.amount), currency: str(payment.currency) ?? "", method: str(payment.method) };
      }
      case "payment.failed": {
        const payment = entity(body, "payment");
        const notes = (payment.notes ?? {}) as Record<string, unknown>;
        return { type: "failed", eventId, orderId: str(payment.order_id), paymentId: str(notes.paymentId), reason: str(payment.error_description) ?? "Payment failed" };
      }
      case "refund.processed": {
        const refund = entity(body, "refund");
        const notes = (refund.notes ?? {}) as Record<string, unknown>;
        return { type: "refund-processed", eventId, gatewayRefundId: str(refund.id) ?? "", refundId: str(notes.refundId), amountMinor: num(refund.amount) };
      }
      case "refund.failed": {
        const refund = entity(body, "refund");
        const notes = (refund.notes ?? {}) as Record<string, unknown>;
        return { type: "refund-failed", eventId, gatewayRefundId: str(refund.id) ?? "", refundId: str(notes.refundId), reason: "The refund failed at Razorpay" };
      }
      default:
        return { type: "ignored", eventId };
    }
  },

  async fetchPayment(credentials, orderId) {
    const key = auth(credentials.keyId, credentials.secret);
    const link = await gatewayRequest(`${API}/payment_links/${encodeURIComponent(orderId)}`, { method: "GET", auth: key });
    const items = Array.isArray(link.payments) ? link.payments as Record<string, unknown>[] : [];
    const paymentId = items.map((item) => str(item.payment_id) ?? str(item.id)).find(Boolean);
    const captured = link.status === "paid" && paymentId ? await gatewayRequest(`${API}/payments/${encodeURIComponent(paymentId)}`, { method: "GET", auth: key }) : null;
    if (captured) return { status: "paid", gatewayPaymentId: str(captured.id), amountMinor: num(captured.amount), currency: str(captured.currency) ?? "", method: str(captured.method) };
    if (link.status === "expired" || link.status === "cancelled") return { status: "failed", reason: "Payment Link expired or cancelled" };
    return { status: "pending" };
  },

  async refund(credentials, args) {
    const refund = await gatewayRequest(`${API}/payments/${encodeURIComponent(args.gatewayPaymentId)}/refund`, {
      method: "POST",
      auth: auth(credentials.keyId, credentials.secret),
      body: JSON.stringify({ amount: args.amountMinor, notes: { refundId: args.refundId } }),
    });
    return razorpayRefund(refund);
  },

  async fetchRefund(credentials, args) {
    const key = auth(credentials.keyId, credentials.secret);
    if (args.gatewayRefundId) return razorpayRefund(await gatewayRequest(`${API}/refunds/${encodeURIComponent(args.gatewayRefundId)}`, { method: "GET", auth: key }));
    const list = await gatewayRequest(`${API}/payments/${encodeURIComponent(args.gatewayPaymentId)}/refunds?count=100`, { method: "GET", auth: key });
    const items = Array.isArray(list.items) ? (list.items as Array<Record<string, unknown>>) : [];
    const match = items.find((item) => ((item.notes ?? {}) as Record<string, unknown>).refundId === args.refundId);
    return match ? razorpayRefund(match) : null;
  },

  async testConnection(credentials) {
    try {
      await gatewayRequest(`${API}/orders?count=1`, { method: "GET", auth: auth(credentials.keyId, credentials.secret) });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Razorpay rejected the keys." };
    }
  },
};

/** Checkout.js hands back this signature; it proves the payment belongs to our order. */
export function verifyCheckoutSignature(secret: string, orderId: string, gatewayPaymentId: string, signature: string) {
  return safeEqualHex(signature, hmacHex(secret, `${orderId}|${gatewayPaymentId}`));
}
