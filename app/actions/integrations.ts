"use server";

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { invalid, revalidate, slugOf, staffAction, type Failure } from "@/lib/actionAccess";
import { ApiKeyError, createApiKey, revokeApiKey } from "@/lib/apiKeys";
import { createEndpoint, deleteEndpoint, EndpointError, EndpointNotFoundError, redeliver, rotateEndpointSecret, sendTestDelivery, updateEndpoint } from "@/lib/webhooks/endpoints";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import { PrinterError, runPrinterCommand, saveConnection } from "@/lib/printers/connections";
import type { Capability } from "@/lib/permissionRoles";
import type { ActionResult } from "./space";

const slug = z.string().trim().min(1).max(64);
const id = z.string().trim().min(1).max(64);
const list = z.union([z.array(z.string().max(64)), z.string().max(64)]).transform((value) => Array.isArray(value) ? value : [value]).default([]);

type Access = Extract<Awaited<ReturnType<typeof staffAction>>, { ok: true }>;
async function run<S extends z.ZodTypeAny, T>(input: unknown, capability: Capability, schema: S,
  work: (tx: Prisma.TransactionClient, actor: { spaceId: string; actorId: string }, data: z.infer<S>, access: Access) => Promise<T>): Promise<ActionResult<T>> {
  const access = await staffAction(slugOf(input), capability);
  if (!access.ok) return access;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const data = await prisma.$transaction((tx) => work(tx, { spaceId: access.space.id, actorId: access.userId }, parsed.data, access));
    revalidate(`/dashboard/${access.space.slug}`, "layout");
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown): Failure {
  if (error instanceof EndpointNotFoundError) return { ok: false, error: "Space not found." };
  if (error instanceof ApiKeyError || error instanceof EndpointError || error instanceof PrinterError) return { ok: false, error: error.message };
  throw error;
}

export async function createApiKeyAction(input: unknown) {
  return run(input, "integrations.manage", z.object({ spaceSlug: slug, name: z.string().trim().min(1, "Name the key").max(80), scopes: list,
    expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional() }),
  async (tx, actor, data) => ({ token: (await createApiKey(tx, actor, data)).token }));
}

export async function revokeApiKeyAction(input: unknown) {
  return run(input, "integrations.manage", z.object({ spaceSlug: slug, keyId: id }), async (tx, actor, data) => { await revokeApiKey(tx, actor, data.keyId); return {}; });
}

const endpointFields = { url: z.string().trim().min(1, "Enter the address").max(2000), description: z.string().trim().max(200).default(""), events: list };

export async function createWebhookAction(input: unknown) {
  return run(input, "integrations.manage", z.object({ spaceSlug: slug, ...endpointFields }), async (tx, actor, data) => ({ secret: (await createEndpoint(tx, actor, data)).secret }));
}

export async function updateWebhookAction(input: unknown) {
  return run(input, "integrations.manage", z.object({ spaceSlug: slug, endpointId: id, ...endpointFields, isActive: z.boolean().default(true) }),
    async (tx, actor, data) => { await updateEndpoint(tx, actor, data); return {}; });
}

export async function rotateWebhookSecretAction(input: unknown) {
  return run(input, "integrations.manage", z.object({ spaceSlug: slug, endpointId: id }), (tx, actor, data) => rotateEndpointSecret(tx, actor, data.endpointId));
}

export async function deleteWebhookAction(input: unknown) {
  return run(input, "integrations.manage", z.object({ spaceSlug: slug, endpointId: id }), async (tx, actor, data) => { await deleteEndpoint(tx, actor, data.endpointId); return {}; });
}

export async function testWebhookAction(input: unknown) {
  const result = await run(input, "integrations.manage", z.object({ spaceSlug: slug, endpointId: id }), async (tx, actor, data) => ({ deliveryId: (await sendTestDelivery(tx, actor, data.endpointId)).id }));
  if (result.ok && result.data) await enqueueWebhookDeliveries([result.data.deliveryId]);
  return result;
}

export async function redeliverWebhookAction(input: unknown) {
  const result = await run(input, "integrations.manage", z.object({ spaceSlug: slug, deliveryId: id }), async (tx, actor, data) => ({ deliveryId: (await redeliver(tx, actor, data.deliveryId)).id }));
  if (result.ok && result.data) await enqueueWebhookDeliveries([result.data.deliveryId]);
  return result;
}

const ADAPTERS = ["MANUAL", "SIMULATED", "OCTOPRINT", "MOONRAKER", "BAMBU", "PRUSALINK"] as const;

export async function savePrinterAction(input: unknown) {
  return run(input, "printers.manage", z.object({ spaceSlug: slug, machineId: id, adapter: z.enum(ADAPTERS), enabled: z.boolean().default(true),
    baseUrl: z.string().trim().max(300).default(""), deviceId: z.string().trim().max(120).default(""), secret: z.string().max(500).default(""),
    pollSeconds: z.coerce.number().int().min(15, "Poll every 15 seconds or more").max(3600).default(15),
    syncMachineStatus: z.boolean().default(true), autoCompleteJobs: z.boolean().default(true) }),
  async (tx, actor, data) => {
    const { pollSeconds, syncMachineStatus, autoCompleteJobs, ...rest } = data;
    return { id: (await saveConnection(tx, actor, { ...rest, secret: rest.secret || undefined, settings: { pollSeconds, syncMachineStatus, autoCompleteJobs } })).id };
  });
}

/** Commands run after the access check, outside a transaction (they may talk to the printer). */
export async function printerCommandAction(input: unknown): Promise<ActionResult<{ message: string }>> {
  const access = await staffAction(slugOf(input), "printers.manage");
  if (!access.ok) return access;
  const parsed = z.object({ spaceSlug: slug, connectionId: id, command: z.enum(["test", "start", "pause", "resume", "cancel", "fail"]) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const result = await runPrinterCommand(access.space.id, parsed.data.connectionId, parsed.data.command, access.userId, { name: "Test print", estimatedSeconds: 600 });
    revalidate(`/dashboard/${access.space.slug}`, "layout");
    return result.ok ? { ok: true, data: { message: result.message } } : { ok: false, error: result.message };
  } catch (error) {
    return failure(error);
  }
}
