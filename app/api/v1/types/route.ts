import { prisma } from "@/lib/db";
import { apiRoute, page, paged } from "@/lib/api/handler";
import { TYPE_DTO, typeDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";

/** GET /api/v1/types */
export const GET = apiRoute("machines:read", {}, async ({ caller, query }) => {
  const rows = await prisma.machineType.findMany({ where: { spaceId: caller.spaceId }, select: TYPE_DTO, ...page(query) });
  return paged(rows.map(typeDto), query);
});
