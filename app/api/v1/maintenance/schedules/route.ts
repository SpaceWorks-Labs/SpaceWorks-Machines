import { prisma } from "@/lib/db";
import { apiRoute, page, paged } from "@/lib/api/handler";
import { SCHEDULE_DTO, scheduleDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";

/** GET /api/v1/maintenance/schedules?machineId= */
export const GET = apiRoute("maintenance:read", {}, async ({ caller, query }) => {
  const rows = await prisma.maintenanceSchedule.findMany({ where: { spaceId: caller.spaceId, ...(query.get("machineId") ? { machineId: query.get("machineId")! } : {}) },
    select: SCHEDULE_DTO, ...page(query) });
  return paged(rows.map(scheduleDto), query);
});
