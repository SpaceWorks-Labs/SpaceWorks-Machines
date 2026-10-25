import "server-only";

import { prisma } from "@/lib/db";
import { assertPublicHost } from "@/lib/net/publicHost";
import { decryptSpaceSecret } from "@/lib/spaceSecrets";
import { getQueues } from "@/lib/queue/client";
import { jobId, WEBHOOK_DELIVER_JOB } from "@/lib/queue/definitions";
import { queueEndpointDisabledAlert } from "./alerts";
import { DISABLE_AFTER_FAILURES, nextAttemptDelay, signWebhook } from "./sign";

export type Sender = (url: string, init: RequestInit) => Promise<Response>;
const LEASE_MS = 2 * 60_000;
const TIMEOUT_MS = 10_000;

/** https only in production; the host must resolve to public addresses (checked again at every send). */
export async function assertDeliverableUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" && (process.env.NODE_ENV === "production" || url.protocol !== "http:")) throw new Error("Use an https:// address.");
  if (url.username || url.password) throw new Error("Leave user names and passwords out of the address.");
  await assertPublicHost(url.hostname);
  return url;
}

/**
 * Send one delivery attempt. The attempt is claimed with a conditional update (status PENDING, due, this attempt
 * count), so a delivery queued twice is sent once. Failures schedule the next try in SQL; the relay re-queues it.
 */
export async function deliverWebhook(deliveryId: string, send: Sender = fetch, now = new Date()): Promise<void> {
  const row = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { endpoint: true } });
  if (!row || row.status !== "PENDING" || (row.nextAttemptAt && row.nextAttemptAt > now)) return;
  const claimed = await prisma.webhookDelivery.updateMany({ where: { id: row.id, status: "PENDING", attempts: row.attempts },
    data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + LEASE_MS) } });
  if (claimed.count === 0) return;
  const attempt = row.attempts + 1;
  if (!row.endpoint.isActive) {
    await prisma.webhookDelivery.update({ where: { id: row.id }, data: { status: "FAILED", lastError: "Endpoint switched off.", nextAttemptAt: null } });
    return;
  }
  let status: number | null = null, error = "";
  try {
    const url = await assertDeliverableUrl(row.endpoint.url);
    const body = JSON.stringify(row.payload);
    const secret = decryptSpaceSecret(row.endpoint.secretEncrypted, row.spaceId, "webhook");
    const response = await send(url.toString(), { method: "POST", body, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "content-type": "application/json", "user-agent": "SpaceWorks-Machines-Webhooks/1",
        "x-spaceworks-signature": signWebhook(secret, body, now), "x-spaceworks-event": row.event, "x-spaceworks-delivery": row.id } });
    status = response.status;
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) error = `The endpoint answered ${response.status}.`;
  } catch (failure) {
    error = failure instanceof Error && failure.name === "TimeoutError" ? "The endpoint did not answer within 10 seconds." : failure instanceof Error ? failure.message.slice(0, 300) : "Delivery failed.";
  }
  if (!error) {
    await prisma.$transaction([
      prisma.webhookDelivery.update({ where: { id: row.id }, data: { status: "SUCCEEDED", responseStatus: status, deliveredAt: now, nextAttemptAt: null, lastError: "" } }),
      prisma.webhookEndpoint.update({ where: { id: row.endpointId }, data: { consecutiveFailures: 0 } }),
    ]);
    return;
  }
  const delay = nextAttemptDelay(attempt);
  await prisma.$transaction(async (tx) => {
    await tx.webhookDelivery.update({ where: { id: row.id }, data: { responseStatus: status, lastError: error,
      ...(delay === null ? { status: "FAILED", nextAttemptAt: null } : { nextAttemptAt: new Date(now.getTime() + delay) }) } });
    const endpoint = await tx.webhookEndpoint.update({ where: { id: row.endpointId }, data: { consecutiveFailures: { increment: 1 } } });
    if (endpoint.isActive && endpoint.consecutiveFailures >= DISABLE_AFTER_FAILURES) {
      await tx.webhookEndpoint.update({ where: { id: endpoint.id }, data: { isActive: false, disabledAt: now } });
      await queueEndpointDisabledAlert(tx, endpoint.spaceId, endpoint.id);
    }
  });
}

/**
 * Beat: queue every pending delivery that is due (new ones whose queueing failed, and retries). Without Redis
 * (in-process jobs, or the cron hook) the due deliveries are sent right here instead, a few at a time.
 */
export async function relayDueWebhooks(now = new Date()) {
  const inline = !process.env.REDIS_URL || process.env.REDIS_URL === "memory://";
  const due = await prisma.webhookDelivery.findMany({ where: { status: "PENDING", nextAttemptAt: { lte: now } }, select: { id: true, attempts: true }, take: inline ? 20 : 500, orderBy: { nextAttemptAt: "asc" } });
  if (inline) {
    for (const row of due) await deliverWebhook(row.id, fetch, now);
    return { sent: due.length };
  }
  if (due.length) await getQueues().sync.addBulk(due.map((row) => ({ name: WEBHOOK_DELIVER_JOB, data: { kind: "webhook" as const, deliveryId: row.id },
    opts: { jobId: jobId("webhook", `${row.id}:${row.attempts}`) } })));
  return { queued: due.length };
}
