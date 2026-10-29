import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, apiRoute, page, paged } from "@/lib/api/handler";
import { LOG_DTO, logDto } from "@/lib/api/dto";
import { logMaintenance } from "@/lib/upkeep";
import { MAINTENANCE_KINDS } from "@/lib/upkeep/schemas";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import { can } from "@/lib/permissionRoles";

export const dynamic = "force-dynamic";
const schema = z.object({ machineId: z.string().min(1).max(64), scheduleId: z.string().min(1).max(64).optional(), faultId: z.string().min(1).max(64).optional(),
  kind: z.enum(MAINTENANCE_KINDS).default("PREVENTIVE"), summary: z.string().trim().min(1).max(200), details: z.string().max(5000).optional(),
  cost: z.number().int().min(0).optional(), vendor: z.string().max(200).optional(), restoreIdle: z.boolean().default(false) });

/** GET /api/v1/maintenance/logs?machineId= */
export const GET = apiRoute("maintenance:read", {}, async ({ caller, query }) => {
  const rows = await prisma.maintenanceLog.findMany({ where: { spaceId: caller.spaceId, ...(query.get("machineId") ? { machineId: query.get("machineId")! } : {}) },
    select: LOG_DTO, ...page(query) });
  return paged(rows.map(logDto), query);
});

/** POST /api/v1/maintenance/logs: cost in minor units of the space currency. */
export const POST = apiRoute("maintenance:write", { write: true, capability: "maintenance.manage" }, async ({ caller, actorId, body }) => {
  const input = await body(schema);
  const { log, webhookDeliveryIds } = await prisma.$transaction(async (tx) => {
    if ((input.cost ?? 0) > 0) {
      const membership = await tx.spaceMember.findUnique({ where: { userId_spaceId: { userId: actorId!, spaceId: caller.spaceId } }, select: { role: true, status: true } });
      if (!membership || membership.status !== "ACTIVE" || !can(membership.role, "finance.manage")) throw new ApiError(403, "Only a machine manager can record maintenance costs.");
    }
    return logMaintenance(tx, { spaceId: caller.spaceId, actorId }, input);
  });
  await enqueueWebhookDeliveries(webhookDeliveryIds);
  // The domain returns the full private row; the REST API exposes the same allowlist as GET.
  const { id, machineId, scheduleId, faultId, kind, summary, cost, performedAt } = log;
  return { data: logDto({ id, machineId, scheduleId, faultId, kind, summary, cost, performedAt }) };
});
