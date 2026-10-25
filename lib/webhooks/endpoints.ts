import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { recordSettingsChange } from "@/lib/audit";
import { encryptSpaceSecret } from "@/lib/spaceSecrets";
import { assertDeliverableUrl } from "./deliver";
import { isWebhookEvent } from "./events";
import { newWebhookSecret } from "./sign";

export class EndpointError extends Error {}
export class EndpointNotFoundError extends Error {
  constructor() { super("Space not found."); }
}
type Actor = { spaceId: string; actorId: string };
export const MAX_ENDPOINTS = 20;

async function cleanUrl(raw: string) {
  try {
    const url = await assertDeliverableUrl(raw.trim());
    return url.toString();
  } catch (error) {
    throw new EndpointError(error instanceof Error ? error.message : "Enter a valid address.");
  }
}

function cleanEvents(events: string[]) {
  const unique = [...new Set(events)];
  if (!unique.length || !unique.every(isWebhookEvent)) throw new EndpointError("Choose at least one event.");
  return unique;
}

async function owned(tx: Prisma.TransactionClient, actor: Actor, endpointId: string) {
  const endpoint = await tx.webhookEndpoint.findFirst({ where: { spaceId: actor.spaceId, id: endpointId } });
  if (!endpoint) throw new EndpointNotFoundError();
  return endpoint;
}

/** Returns the signing secret once; only its ciphertext is stored. */
export async function createEndpoint(tx: Prisma.TransactionClient, actor: Actor, input: { url: string; description?: string; events: string[] }) {
  if (await tx.webhookEndpoint.count({ where: { spaceId: actor.spaceId } }) >= MAX_ENDPOINTS) throw new EndpointError(`A space can have up to ${MAX_ENDPOINTS} endpoints.`);
  const secret = newWebhookSecret();
  const endpoint = await tx.webhookEndpoint.create({ data: { spaceId: actor.spaceId, url: await cleanUrl(input.url), description: (input.description ?? "").trim().slice(0, 200),
    events: cleanEvents(input.events), secretEncrypted: encryptSpaceSecret(secret, actor.spaceId, "webhook"), createdById: actor.actorId } });
  await recordSettingsChange({ spaceId: actor.spaceId, actorUserId: actor.actorId, area: "integrations.webhooks", fields: ["created"], targetType: "WebhookEndpoint", targetId: endpoint.id, client: tx });
  return { endpoint, secret };
}

/** Switching an endpoint back on clears its failure count. */
export async function updateEndpoint(tx: Prisma.TransactionClient, actor: Actor, input: { endpointId: string; url: string; description?: string; events: string[]; isActive: boolean }) {
  const before = await owned(tx, actor, input.endpointId);
  const after = { url: await cleanUrl(input.url), description: (input.description ?? "").trim().slice(0, 200), events: cleanEvents(input.events), isActive: input.isActive };
  const endpoint = await tx.webhookEndpoint.update({ where: { id: before.id }, data: { ...after,
    ...(input.isActive && !before.isActive ? { consecutiveFailures: 0, disabledAt: null } : {}), ...(!input.isActive && before.isActive ? { disabledAt: new Date() } : {}) } });
  await recordSettingsChange({ spaceId: actor.spaceId, actorUserId: actor.actorId, area: "integrations.webhooks", targetType: "WebhookEndpoint", targetId: before.id, client: tx,
    before: { url: before.url, description: before.description, events: before.events.join(","), isActive: before.isActive },
    after: { ...after, events: after.events.join(",") } });
  return endpoint;
}

export async function rotateEndpointSecret(tx: Prisma.TransactionClient, actor: Actor, endpointId: string) {
  const endpoint = await owned(tx, actor, endpointId);
  const secret = newWebhookSecret();
  await tx.webhookEndpoint.update({ where: { id: endpoint.id }, data: { secretEncrypted: encryptSpaceSecret(secret, actor.spaceId, "webhook") } });
  await recordSettingsChange({ spaceId: actor.spaceId, actorUserId: actor.actorId, area: "integrations.webhooks", fields: ["secret"], targetType: "WebhookEndpoint", targetId: endpoint.id, client: tx });
  return { secret };
}

export async function deleteEndpoint(tx: Prisma.TransactionClient, actor: Actor, endpointId: string) {
  const endpoint = await owned(tx, actor, endpointId);
  await tx.webhookEndpoint.delete({ where: { id: endpoint.id } });
  await recordSettingsChange({ spaceId: actor.spaceId, actorUserId: actor.actorId, area: "integrations.webhooks", fields: ["deleted"], targetType: "WebhookEndpoint", targetId: endpoint.id, client: tx });
}

/** A `webhook.test` delivery to one endpoint, whatever it subscribes to. */
export async function sendTestDelivery(tx: Prisma.TransactionClient, actor: Actor, endpointId: string) {
  const endpoint = await owned(tx, actor, endpointId);
  const id = randomUUID();
  const payload = { id, event: "webhook.test", spaceId: actor.spaceId, createdAt: new Date().toISOString(), data: { endpointId: endpoint.id } };
  return tx.webhookDelivery.create({ data: { spaceId: actor.spaceId, endpointId: endpoint.id, event: "webhook.test", eventId: id, payload, nextAttemptAt: new Date() } });
}

/** Send a past delivery again as a new delivery with the same event id, so receivers can de-duplicate. */
export async function redeliver(tx: Prisma.TransactionClient, actor: Actor, deliveryId: string) {
  const original = await tx.webhookDelivery.findFirst({ where: { spaceId: actor.spaceId, id: deliveryId } });
  if (!original) throw new EndpointNotFoundError();
  return tx.webhookDelivery.create({ data: { spaceId: actor.spaceId, endpointId: original.endpointId, event: original.event, eventId: original.eventId,
    payload: original.payload as Prisma.InputJsonValue, nextAttemptAt: new Date() } });
}
