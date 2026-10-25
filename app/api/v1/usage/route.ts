import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/api/handler";
import { recordUsage } from "@/lib/usage/record";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";

export const dynamic = "force-dynamic";
const schema = z.object({ machineId: z.string().min(1).max(64), minutes: z.number().int().min(0).max(100_000), succeeded: z.boolean().default(true),
  note: z.string().trim().max(2000).default("") });

/** POST /api/v1/usage: log a run outside the queue, recorded as a manual run by the key's creator. */
export const POST = apiRoute("maintenance:write", { write: true, capability: "jobs.operate" }, async ({ caller, actorId, body }) => {
  const input = await body(schema);
  const { log, webhookDeliveryIds } = await prisma.$transaction((tx) => recordUsage(tx, { spaceId: caller.spaceId, source: "MANUAL", actorId, ...input }));
  await enqueueWebhookDeliveries(webhookDeliveryIds);
  return { data: { id: log.id, machineId: log.machineId, minutes: log.minutes, succeeded: log.succeeded, createdAt: log.createdAt.toISOString() } };
});
