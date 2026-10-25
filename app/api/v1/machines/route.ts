import { prisma } from "@/lib/db";
import { apiRoute, page, paged } from "@/lib/api/handler";
import { MACHINE_DTO, machineDto } from "@/lib/api/dto";
import { MACHINE_STATUSES } from "@/lib/machines/schemas";

export const dynamic = "force-dynamic";

/** GET /api/v1/machines?typeId=&status=&cursor=&limit= */
export const GET = apiRoute("machines:read", {}, async ({ caller, query }) => {
  const status = MACHINE_STATUSES.find((value) => value === query.get("status"));
  const rows = await prisma.machine.findMany({ where: { spaceId: caller.spaceId, ...(query.get("typeId") ? { typeId: query.get("typeId")! } : {}),
    ...(status ? { status } : {}) }, select: MACHINE_DTO, ...page(query) });
  return paged(rows.map(machineDto), query);
});
