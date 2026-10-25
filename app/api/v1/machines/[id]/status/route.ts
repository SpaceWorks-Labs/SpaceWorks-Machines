import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/api/handler";
import { changeMachineStatus } from "@/lib/machines/machines";
import { MANUAL_MACHINE_STATUSES } from "@/lib/machines/schemas";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";

export const dynamic = "force-dynamic";
const schema = z.object({ status: z.enum(MANUAL_MACHINE_STATUSES), note: z.string().trim().max(280).default("") });

/** POST /api/v1/machines/{id}/status { status, note } */
export const POST = apiRoute<{ id: string }>("machines:write", { write: true, capability: "machines.status" }, async ({ caller, actorId, params, body }) => {
  const input = await body(schema);
  const result = await prisma.$transaction((tx) => changeMachineStatus(tx, { spaceId: caller.spaceId, actorId, machineId: params.id, ...input }));
  await enqueueWebhookDeliveries(result.webhookDeliveryIds);
  return { data: { id: params.id, status: input.status, changed: result.changed } };
});
