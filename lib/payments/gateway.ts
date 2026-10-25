import "server-only";

import crypto from "crypto";

/**
 * One interface for both gateways, so pricing, tax and receipts are identical whichever a space
 * uses. Adapters talk to the providers' REST APIs directly and return hosted checkout links.
 */

export type GatewayCredentials = { keyId: string | null; secret: string; webhookSecret: string | null; testMode: boolean };

export type CheckoutRequest = {
  paymentId: string;
  spaceId: string;
  /** What the payment is for, e.g. a job id (Phase 3). Sent to the provider as metadata only. */
  reference: string | null;
  amountMinor: number;
  currency: string;
  description: string;
  spaceName: string;
  customer: { name: string; email: string };
  successUrl: string;
  cancelUrl: string;
  checkoutKey?: string;
};

export type CheckoutResult =
  | { kind: "razorpay"; orderId: string; keyId: string }
  | { kind: "redirect"; orderId: string; url: string; expiresAt?: Date };

export type GatewayEvent =
  | { type: "captured"; eventId: string; orderId: string | null; paymentId: string | null; gatewayPaymentId: string | null; amountMinor: number; currency: string; method: string | null }
  | { type: "failed"; eventId: string; orderId: string | null; paymentId: string | null; reason: string }
  | { type: "refund-processed"; eventId: string; gatewayRefundId: string; refundId: string | null; amountMinor: number }
  | { type: "refund-failed"; eventId: string; gatewayRefundId: string; refundId: string | null; reason: string }
  | { type: "ignored"; eventId: string };

export type FetchedPayment =
  | { status: "paid"; gatewayPaymentId: string | null; amountMinor: number; currency: string; method: string | null }
  | { status: "pending" }
  | { status: "failed"; reason: string };

export type RefundResult = { gatewayRefundId: string; status: "pending" | "processed" | "failed" };

export interface PaymentGateway {
  /** Recover a Payment Link after an ambiguous create response, without creating another. */
  findCheckout?(credentials: GatewayCredentials, paymentId: string): Promise<CheckoutResult | null>;
  /** Razorpay capture payloads may omit link metadata; resolve through the account's link lookup. */
  paymentReference?(credentials: GatewayCredentials, gatewayPaymentId: string): Promise<{ paymentId: string; orderId: string } | null>;
  createCheckout(credentials: GatewayCredentials, request: CheckoutRequest): Promise<CheckoutResult>;
  verifyWebhook(credentials: GatewayCredentials, rawBody: string, headers: Headers, now?: Date): boolean;
  parseEvent(rawBody: string, headers: Headers): GatewayEvent;
  fetchPayment(credentials: GatewayCredentials, orderId: string): Promise<FetchedPayment>;
  refund(credentials: GatewayCredentials, args: { gatewayPaymentId: string; amountMinor: number; currency: string; refundId: string }): Promise<RefundResult>;
  /** Look a refund up by its gateway id, or by our refund id on the payment's refunds; null if it isn't there. */
  fetchRefund(credentials: GatewayCredentials, args: { gatewayPaymentId: string; gatewayRefundId: string | null; refundId: string }): Promise<RefundResult | null>;
  testConnection(credentials: GatewayCredentials): Promise<{ ok: true } | { ok: false; error: string }>;
}

/** A provider answered with an error. `retryable` separates outages from bad requests. */
export class GatewayError extends Error {
  override name = "GatewayError";
  constructor(message: string, readonly status: number, readonly retryable: boolean) {
    super(message);
  }
}

export function hmacHex(secret: string, value: string) {
  return crypto.createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function safeEqualHex(a: string, b: string) {
  if (!/^[a-f0-9]+$/i.test(a) || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** JSON or form request to a provider with a timeout. Error bodies are reduced to a short message. */
export async function gatewayRequest(url: string, init: { method: "GET" | "POST"; auth: string; body?: string; contentType?: string; idempotencyKey?: string }) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: {
        authorization: init.auth,
        accept: "application/json",
        ...(init.body ? { "content-type": init.contentType ?? "application/json" } : {}),
        ...(init.idempotencyKey ? { "idempotency-key": init.idempotencyKey } : {}),
      },
      body: init.body,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new GatewayError("The payment provider could not be reached.", 0, true);
  }
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // Non-JSON error pages fall through to the status check below.
  }
  if (!response.ok) {
    const error = (json.error ?? {}) as { description?: unknown; message?: unknown };
    const message = typeof error.description === "string" ? error.description : typeof error.message === "string" ? error.message : `The payment provider answered ${response.status}.`;
    throw new GatewayError(message.slice(0, 300), response.status, response.status >= 500 || response.status === 429);
  }
  return json;
}

export function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
