import { prisma } from "@/lib/db";
import { apiRoute, page, paged } from "@/lib/api/handler";
import { PAYMENT_DTO, paymentDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";
const STATUSES = ["PENDING", "PAID", "FAILED", "CANCELLED", "WAIVED"] as const;

/** GET /api/v1/payments?status= */
export const GET = apiRoute("payments:read", {}, async ({ caller, query }) => {
  const status = STATUSES.find((value) => value === query.get("status"));
  const rows = await prisma.payment.findMany({ where: { spaceId: caller.spaceId, ...(status ? { status } : {}) }, select: PAYMENT_DTO, ...page(query) });
  return paged(rows.map(paymentDto), query);
});
