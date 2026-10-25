import { prisma } from "@/lib/db";
import { spaceActionAccess } from "@/lib/permissions";
import { can } from "@/lib/permissionRoles";
import { csvCell } from "@/lib/jobs/presentation";
import { isCurrencyCode, toInputValue } from "@/lib/money/currencies";
import { loadReports, REPORT_KINDS, reportRange, withoutMoney, type ReportKind, type Reports } from "@/lib/reports/load";
import { MONEY_REPORTS } from "@/lib/reports/range";
import { loadSpendReports, type SpendReports } from "@/lib/reports/spend";
import { buildXlsx, XLSX_TYPE, type Cell } from "@/lib/xlsx";

export const dynamic = "force-dynamic";

const amount = (value: number, currency: string) => isCurrencyCode(currency) ? toInputValue(value, currency) : String(value);

function spendRows(kind: "spend" | "repairs", reports: SpendReports): unknown[][] {
  if (kind === "spend") return [["Machine", "Currency", "Repairs", "Maintenance", "Parts", "Consumables", "Total"],
    ...reports.spend.map((r) => [r.machine, r.currency, amount(r.repairs, r.currency), amount(r.maintenance, r.currency), amount(r.parts, r.currency), amount(r.consumables, r.currency), amount(r.total, r.currency)])];
  return [["Month", "Paid on", "Repair", "Machine", "Technician", "Method", "Reference", "Currency", "Amount"],
    ...reports.repairs.map((r) => [r.month, r.paidOn, r.fault, r.machine, r.technician, r.method, r.reference, r.currency, amount(r.amount, r.currency)])];
}

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

/** One report as CSV (or ?format=xlsx) over ?from=&to=. Money reports are the machine manager's; others get amounts blanked. */
export async function GET(request: Request, { params }: { params: Promise<{ spaceSlug: string; kind: string }> }) {
  const { spaceSlug, kind } = await params;
  if (!REPORT_KINDS.includes(kind as ReportKind)) return new Response("Not found.", { status: 404 });
  const access = await spaceActionAccess(spaceSlug, "reports.view");
  const money = access.ok && can(access.membership.role, "finance.view");
  if (!access.ok || (MONEY_REPORTS.includes(kind) && !money)) return new Response("Not found.", { status: 404 });
  const query = new URL(request.url).searchParams;
  const range = reportRange(query.get("from"), query.get("to"));
  let table: unknown[][];
  if (kind === "spend" || kind === "repairs") table = spendRows(kind, await loadSpendReports(access.space.id, range.from, range.to));
  else {
    const [reports, space] = await Promise.all([loadReports(access.space.id, range.from, range.to, access.typeScope),
      prisma.space.findUniqueOrThrow({ where: { id: access.space.id }, select: { currency: true } })]);
    table = rows(kind as ReportKind, money ? reports : withoutMoney(reports), space.currency);
  }
  const name = `${kind}-${range.fromInput}-to-${range.toInput}`;
  const headers = { "Cache-Control": "private, no-store" };
  if (query.get("format") === "xlsx") {
    return new Response(new Uint8Array(buildXlsx(kind, table as Cell[][])), { headers: { ...headers, "Content-Type": XLSX_TYPE, "Content-Disposition": `attachment; filename="${name}.xlsx"` } });
  }
  return new Response(table.map((row) => row.map(csvCell).join(",")).join("\r\n"), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${name}.csv"` } });
}
