import "server-only";

import type { PaymentProvider, Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { credentialsOf, GATEWAYS } from "./config";
import type { GatewayEvent } from "./gateway";
import { settleCapture } from "./jobs/settlement";
import { settleRefund } from "./refundSettlement";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import type { GatewayClients } from "./jobs/clients";

export type WebhookOutcome = { status: number; body: string };

/**
 * Apply inside the idempotency transaction, without consulting current payment enablement.
 */
export async function applyGatewayEvent(tx: Prisma.TransactionClient, spaceId: string, provider: PaymentProvider, event: GatewayEvent) {
  const ids = event.type === "captured" || event.type === "failed" ? await settleCapture(tx, spaceId, provider, event) :
    event.type === "refund-processed" || event.type === "refund-failed" ? await settleRefund(tx, spaceId, provider, event) : null;
  if (ids) return ids;
  await recordAuditEvent({ action: "PAYMENT_WEBHOOK_UNMATCHED", actorUserId: null, spaceId, targetType: "Webhook", targetId: event.eventId.slice(0, 120), metadata: { provider, type: event.type }, client: tx });
  return [];
}

/**
 * Verify and record one webhook. The space is found by the unguessable code in the URL; the body must carry
 * a valid signature for that space's own secret; each provider event id is applied once
 * (ProcessedWebhookEvent), however often the gateway retries.
 */
export async function handleWebhook(provider: Exclude<PaymentProvider, "OFFLINE">, code: string, rawBody: string, headers: Headers, clients: GatewayClients = {}): Promise<WebhookOutcome> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return { status: 404, body: "Not found" };
  const settings = await prisma.spacePaymentSettings.findUnique({ where: { webhookPublicCode: code } });
  if (!settings || settings.provider !== provider) return { status: 404, body: "Not found" };
  const credentials = credentialsOf(settings);
  const gateway = clients[provider] ?? GATEWAYS[provider];
  if (!credentials || !gateway.verifyWebhook(credentials, rawBody, headers)) return { status: 401, body: "Invalid signature" };

  let event: GatewayEvent;
  try {
    event = gateway.parseEvent(rawBody, headers);
  } catch {
    return { status: 400, body: "Invalid payload" };
  }
  if (event.type === "ignored" || !event.eventId) return { status: 200, body: "Ignored" };

  // Payment Links do not always copy their reference into payment.captured notes.
  // Resolve before opening SQL locks; ordinary link-paid/session events need no provider HTTP.
  if (provider === "RAZORPAY" && event.type === "captured" && !event.paymentId && event.gatewayPaymentId && gateway.paymentReference) {
    const known = await prisma.payment.count({ where: { spaceId: settings.spaceId, method: "RAZORPAY", checkoutKey: { not: null } } });
    if (known) {
      const reference = await gateway.paymentReference(credentials, event.gatewayPaymentId);
      if (reference) event = { ...event, ...reference };
    }
  }

  const applied = await prisma.$transaction(async (tx) => {
    const fresh = await tx.processedWebhookEvent.createMany({ data: [{ provider, eventId: event.eventId.slice(0, 200), spaceId: settings.spaceId }], skipDuplicates: true });
    if (fresh.count === 0) return { applied: false, ids: [] };
    return { applied: true, ids: await applyGatewayEvent(tx, settings.spaceId, provider, event) };
  });
  await enqueueWebhookDeliveries(applied.ids);
  return { status: 200, body: applied.applied ? "OK" : "Duplicate" };
}
