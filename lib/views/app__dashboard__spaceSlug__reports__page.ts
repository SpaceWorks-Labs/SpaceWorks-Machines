import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { can, spaceAllows } from "@/lib/permissionRoles";
import { loadReports, reportRange, withoutMoney } from "@/lib/reports/load";
import { loadSpendReports } from "@/lib/reports/spend";

type Props = { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ from?: string; to?: string }> };

/** Reports over a date range. Money (revenue and costs) appears only for roles that may see payments: the machine manager. */
export async function loadReportsView({ params, searchParams }: Props) {
  const { spaceSlug } = await params;
  const { space, membership, typeScope } = await requireSpaceCapability(spaceSlug, "reports.view");
  const query = await searchParams;
  const range = reportRange(query.from, query.to);
  const [profile, reports] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, timezone: true, currency: true, locale: true } }),
    loadReports(space.id, range.from, range.to, typeScope),
  ]);
  const showMoney = can(membership.role, "finance.view") && spaceAllows(space.status, "finance.view");
  const spend = showMoney ? await loadSpendReports(space.id, range.from, range.to) : null;
  return { space: { ...space, ...profile }, range: { from: range.fromInput, to: range.toInput }, showMoney,
    reports: showMoney ? reports : withoutMoney(reports), spend };
}
