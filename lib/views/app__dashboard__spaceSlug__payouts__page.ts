import { prisma } from "@/lib/db";
import { requireMoneyCapability } from "@/lib/permissions";
import { reportRange } from "@/lib/reports/range";
import { faultNumber } from "@/lib/upkeep/labels";

type Props = { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ from?: string; to?: string }> };

/** The append-only payout ledger for a period: the machine manager's (finance). */
export async function loadPayoutsView({ params, searchParams }: Props) {
  const { spaceSlug } = await params;
  const { space } = await requireMoneyCapability(spaceSlug, "repairs.pay");
  const query = await searchParams;
  const range = reportRange(query.from, query.to);
  const [profile, payouts] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, currency: true, locale: true } }),
    prisma.repairPayout.findMany({ where: { spaceId: space.id, paidAt: { gte: range.from, lt: range.to } }, orderBy: { paidAt: "desc" }, take: 500,
      include: { technician: { select: { name: true } }, fault: { select: { number: true, title: true, machine: { select: { name: true } } } } } }),
  ]);
  return {
    space: { ...space, ...profile }, range: { from: range.fromInput, to: range.toInput },
    payouts: payouts.map((row) => ({ id: row.id, paidAt: row.paidAt.toISOString(), amount: row.amount, currency: row.currency, method: row.method, reference: row.reference,
      technician: row.technician.name, fault: { number: row.fault.number, label: faultNumber(row.fault.number), title: row.fault.title }, machine: row.fault.machine.name })),
  };
}
