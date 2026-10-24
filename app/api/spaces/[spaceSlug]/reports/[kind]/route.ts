import { prisma } from "@/lib/db";
import { spaceActionAccess } from "@/lib/permissions";
import { can } from "@/lib/permissionRoles";
import { csvCell } from "@/lib/jobs/presentation";
import { isCurrencyCode, toInputValue } from "@/lib/money/currencies";
import { loadReports, REPORT_KINDS, reportRange, withoutMoney, type ReportKind, type Reports } from "@/lib/reports/load";

export const dynamic = "force-dynamic";

const amount = (value: number, currency: string) => isCurrencyCode(currency) ? toInputValue(value, currency) : String(value);

function rows(kind: ReportKind, reports: Reports | ReturnType<typeof withoutMoney>, currency: string): unknown[][] {
  if (kind === "jobs") return [["Group", "Value", "Jobs"], ...reports.jobs.byStatus.map((r) => ["Status", r.label, r.total]),
    ...reports.jobs.byType.map((r) => ["Type", r.label, r.total]), ...reports.jobs.byMachine.map((r) => ["Machine", r.label, r.total]),
    ["Failure rate", reports.jobs.failureRate ?? "", ""], ["Average turnaround (minutes)", reports.jobs.turnaroundMinutes ?? "", ""]];
  if (kind === "utilisation") return [["Machine", "Hours run", "Runs", "Availability", "Downtime (minutes)", "MTTR (minutes)", "MTBF (minutes)"],
    ...reports.utilisation.map((r) => [r.name, Math.round(r.hoursRun * 100) / 100, r.runs, Math.round(r.availability * 10000) / 10000, r.downtimeMinutes, r.mttrMinutes ?? "", r.mtbfMinutes ?? ""])];
  if (kind === "consumables") return [["Pool", "Material", "Unit", "Used", "Cost"], ...reports.consumables.map((r) => [r.label, r.material, r.unit, r.used, r.cost === null ? "" : amount(r.cost, currency)])];
  // Revenue is only exported to payments.view (checked in GET), so it is never the money-free copy here.
  if (kind === "revenue") return [["Group", "Value", "Currency", "Amount"],
    ...reports.revenue!.currencies.flatMap((r) => [["Total", "Paid", r.currency, amount(r.paid, r.currency)], ["Total", "Pending", r.currency, amount(r.pending, r.currency)],
      ["Total", "Refunded", r.currency, amount(r.refunded, r.currency)], ["Total", "Waived", r.currency, amount(r.waived, r.currency)]]),
    ...reports.revenue!.byMethod.map((r) => ["Method", r.label, r.currency, amount(r.amount, r.currency)]),
    ...reports.revenue!.byType.map((r) => ["Type", r.label, r.currency, amount(r.amount, r.currency)]),
    ...reports.revenue!.byMachine.map((r) => ["Machine", r.label, r.currency, amount(r.amount, r.currency)])];
  if (kind === "maintenance") return [["Records", "Cost", "Overdue now", "Faults", "MTBF (minutes)", "MTTR (minutes)"],
    [reports.maintenance.logs, reports.maintenance.cost === null ? "" : amount(reports.maintenance.cost, currency), reports.maintenance.overdue,
      reports.maintenance.faults, reports.maintenance.mtbfMinutes ?? "", reports.maintenance.mttrMinutes ?? ""]];
  return [["Machine", "Vendor", "Contract", "Expires", "State"], ...reports.warranty.map((r) => [r.machine, r.vendor, r.contract, r.expiresOn ?? "", r.state])];
}

/** One report as CSV over ?from=&to=. Revenue needs payments.view as well; without it every amount is blank. */
export async function GET(request: Request, { params }: { params: Promise<{ spaceSlug: string; kind: string }> }) {
  const { spaceSlug, kind } = await params;
  if (!REPORT_KINDS.includes(kind as ReportKind)) return new Response("Not found.", { status: 404 });
  const access = await spaceActionAccess(spaceSlug, "reports.view");
  if (!access.ok || (kind === "revenue" && !can(access.membership.role, "payments.view"))) return new Response("Not found.", { status: 404 });
  const query = new URL(request.url).searchParams;
  const range = reportRange(query.get("from"), query.get("to"));
  const [reports, space] = await Promise.all([loadReports(access.space.id, range.from, range.to, access.typeScope),
    prisma.space.findUniqueOrThrow({ where: { id: access.space.id }, select: { currency: true } })]);
  const visible = can(access.membership.role, "payments.view") ? reports : withoutMoney(reports);
  const csv = rows(kind as ReportKind, visible, space.currency).map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="${kind}-${range.fromInput}-to-${range.toInput}.csv"` } });
}
