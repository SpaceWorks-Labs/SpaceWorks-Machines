import "server-only";
import { PaymentMethod, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PAYMENT_SELECT } from "@/lib/jobs/viewQueries";

export function paymentFilters(filters: { status?: string; method?: string }) {
  const status = Object.values(PaymentStatus).find((v) => v === filters.status);
  const method = Object.values(PaymentMethod).find((v) => v === filters.method);
  return { ...(status ? { status } : {}), ...(method ? { method } : {}) };
}
export async function listPayments(spaceId: string, filters: { status?: string; method?: string }) {
  const rows = await prisma.payment.findMany({ where: { spaceId, ...paymentFilters(filters) }, orderBy: { createdAt: "desc" },
    select: { ...PAYMENT_SELECT, job: { select: { number: true, title: true } } } });
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}
