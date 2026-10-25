import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getQueues } from "@/lib/queue/client";
import { jobId, WEBHOOK_DELIVER_JOB } from "@/lib/queue/definitions";
import type { WebhookEvent } from "./events";

/** JSON-safe facts about the event: ids, statuses, counts. Never personal data or secrets. */
export type WebhookData = Record<string, string | number | boolean | null>;

/**
 * Record one delivery per active endpoint of the space subscribed to `event`, inside the caller's transaction,
 * so a webhook exists exactly when the change it reports commits. Returns the delivery ids; hand them to
 * `enqueueWebhookDeliveries` after the transaction commits. No endpoints: nothing is written.
 */
export async function emitWebhook(tx: Prisma.TransactionClient, spaceId: string, event: WebhookEvent, data: WebhookData): Promise<string[]> {
  const endpoints = await tx.webhookEndpoint.findMany({ where: { spaceId, isActive: true, events: { has: event } }, select: { id: true } });
  if (endpoints.length === 0) return [];
  const eventId = randomUUID();
  const payload = { id: eventId, event, spaceId, createdAt: new Date().toISOString(), data };
  const rows = await tx.webhookDelivery.createManyAndReturn({
    data: endpoints.map((endpoint) => ({ spaceId, endpointId: endpoint.id, event, eventId, payload, nextAttemptAt: new Date() })),
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * After commit: put the deliveries on the `sync` queue. Best effort; a delivery that could not be queued stays
 * PENDING in SQL for the Phase 5 relay, so a Redis outage never fails the change itself.
 */
export async function enqueueWebhookDeliveries(deliveryIds: readonly string[]) {
  if (deliveryIds.length === 0) return;
  try {
    await getQueues().sync.addBulk(deliveryIds.map((deliveryId) => ({
      name: WEBHOOK_DELIVER_JOB,
      data: { kind: "webhook" as const, deliveryId },
      opts: { jobId: jobId("webhook", deliveryId) },
    })));
  } catch {
    console.error("[webhooks] Could not queue deliveries; they stay pending.");
  }
}
