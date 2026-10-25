import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/api/handler";
import { POOL_DTO, poolDto } from "@/lib/api/dto";
import { correctPool, restockPool } from "@/lib/consumables/pools";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";

export const dynamic = "force-dynamic";
const quantity = z.string().regex(/^-?\d{1,11}(?:\.\d{1,3})?$/, "Enter a quantity with up to three decimal places");
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("restock"), quantity, reason: z.string().trim().max(500).optional() }),
  z.object({ kind: z.literal("correction"), quantity, reason: z.string().trim().min(1, "Give a reason").max(500) }),
]);

/** POST /api/v1/consumables/{id}/adjustments { kind: restock | correction, quantity, reason } */
export const POST = apiRoute<{ id: string }>("consumables:write", { write: true, capability: "consumables.manage" }, async ({ caller, actorId, params, body }) => {
  const input = await body(schema);
  const result: unknown = await prisma.$transaction((tx) => input.kind === "restock"
    ? restockPool(tx, { spaceId: caller.spaceId, poolId: params.id, actorId: actorId!, quantity: input.quantity, reason: input.reason })
    : correctPool(tx, { spaceId: caller.spaceId, poolId: params.id, actorId: actorId!, delta: input.quantity, reason: input.reason }));
  await enqueueWebhookDeliveries((result as { webhookDeliveryIds?: string[] } | null)?.webhookDeliveryIds ?? []);
  const row = await prisma.consumablePool.findFirstOrThrow({ where: { spaceId: caller.spaceId, id: params.id }, select: POOL_DTO });
  return { data: poolDto(row) };
});
