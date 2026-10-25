import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiRoute, page, paged } from "@/lib/api/handler";
import { FAULT_DTO, faultDto } from "@/lib/api/dto";
import { reportFault } from "@/lib/upkeep";
import { FAULT_SEVERITIES, FAULT_STATUSES } from "@/lib/upkeep/schemas";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";

export const dynamic = "force-dynamic";
const schema = z.object({ machineId: z.string().min(1).max(64), severity: z.enum(FAULT_SEVERITIES).default("MEDIUM"), title: z.string().trim().min(1).max(120),
  description: z.string().max(5000).optional() });

/** GET /api/v1/faults?status= */
export const GET = apiRoute("maintenance:read", {}, async ({ caller, query }) => {
  const status = FAULT_STATUSES.find((value) => value === query.get("status"));
  const rows = await prisma.faultReport.findMany({ where: { spaceId: caller.spaceId, ...(status ? { status } : {}) }, select: FAULT_DTO, ...page(query) });
  return paged(rows.map(faultDto), query);
});

/** POST /api/v1/faults: report a fault as the key's creator. */
export const POST = apiRoute("maintenance:write", { write: true, capability: "maintenance.view" }, async ({ caller, actorId, body }) => {
  const input = await body(schema);
  const { fault, webhookDeliveryIds } = await prisma.$transaction((tx) => reportFault(tx, { spaceId: caller.spaceId, actorId }, input));
  await enqueueWebhookDeliveries(webhookDeliveryIds);
  const row = await prisma.faultReport.findUniqueOrThrow({ where: { id: fault.id }, select: FAULT_DTO });
  return { data: faultDto(row) };
});
