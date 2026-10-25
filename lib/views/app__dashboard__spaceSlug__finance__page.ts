import { prisma } from "@/lib/db";
import { requireMoneyCapability } from "@/lib/permissions";
import { can, spaceAllows } from "@/lib/permissionRoles";
import { loadFinance } from "@/lib/finance/load";
import { financePeriod, PERIOD_KINDS, type PeriodKind } from "@/lib/finance/period";

type Props = { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ period?: string; on?: string }> };

/** The finance page: the machine manager's alone (owner decision 2026-10-24); everyone else is sent back. */
export async function loadFinanceView({ params, searchParams }: Props) {
  const { spaceSlug } = await params;
  const { space, membership } = await requireMoneyCapability(spaceSlug, "finance.view");
  const query = await searchParams;
  const profile = await prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, timezone: true, currency: true, locale: true } });
  const kind = PERIOD_KINDS.find((value) => value === query.period) ?? "month";
  const period = financePeriod(kind as PeriodKind, query.on, profile.timezone);
  const [finance, machines] = await Promise.all([
    loadFinance(space, period.from, period.to),
    prisma.machine.findMany({ where: { spaceId: space.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const reversed = new Set((await prisma.financeEntry.findMany({ where: { spaceId: space.id, reversesId: { in: finance.entries.map((entry) => entry.id) } },
    select: { reversesId: true } })).map((row) => row.reversesId));
  return {
    space: { ...space, ...profile }, period: { kind, label: period.label, anchor: period.anchor, previous: period.previous, next: period.next },
    canManage: can(membership.role, "finance.manage") && spaceAllows(space.status, "finance.manage"),
    summary: finance.summary, count: finance.count, machines,
    entries: finance.entries.map((entry) => ({ ...entry, reversible: entry.reversible && !reversed.has(entry.id) })),
  };
}
