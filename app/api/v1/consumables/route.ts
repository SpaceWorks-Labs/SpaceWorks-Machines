import { prisma } from "@/lib/db";
import { apiRoute, page, paged } from "@/lib/api/handler";
import { POOL_DTO, poolDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";

/** GET /api/v1/consumables */
export const GET = apiRoute("consumables:read", {}, async ({ caller, query }) => {
  const rows = await prisma.consumablePool.findMany({ where: { spaceId: caller.spaceId }, select: POOL_DTO, ...page(query) });
  return paged(rows.map(poolDto), query);
});
