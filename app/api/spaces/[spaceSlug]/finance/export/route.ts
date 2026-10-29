import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { spaceActionAccess } from "@/lib/permissions";
import { csvCell } from "@/lib/jobs/presentation";
import { financePeriod, PERIOD_KINDS, type PeriodKind } from "@/lib/finance/period";
import { CATEGORY_LABELS, METHOD_LABELS } from "@/lib/finance/summary";
import { isCurrencyCode, toInputValue } from "@/lib/money/currencies";
import { buildXlsx, XLSX_TYPE } from "@/lib/xlsx";
import { calendarDayAt } from "@/lib/calendarDay";

export const dynamic = "force-dynamic";

/** Every ledger entry in a period as CSV or Excel, for the machine manager only (anyone else: not found). Audited. */
export async function GET(request: Request, { params }: { params: Promise<{ spaceSlug: string }> }) {
  const access = await spaceActionAccess((await params).spaceSlug, "finance.view");
  if (!access.ok) return new Response("Not found.", { status: 404 });
  const query = new URL(request.url).searchParams;
  const format = query.get("format") === "xlsx" ? "xlsx" : "csv";
  const space = await prisma.space.findUniqueOrThrow({ where: { id: access.space.id }, select: { timezone: true } });
  const kind = (PERIOD_KINDS.find((value) => value === query.get("period")) ?? "month") as PeriodKind;
  const period = financePeriod(kind, query.get("on"), space.timezone);
  const [entries, machines, technicians] = await Promise.all([
    prisma.financeEntry.findMany({ where: { spaceId: access.space.id, occurredAt: { gte: period.from, lt: period.to } }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }], take: 50_000 }),
    prisma.machine.findMany({ where: { spaceId: access.space.id }, select: { id: true, name: true } }),
    prisma.technician.findMany({ where: { spaceId: access.space.id }, select: { id: true, name: true } }),
  ]);
  const machine = new Map(machines.map((row) => [row.id, row.name])), technician = new Map(technicians.map((row) => [row.id, row.name]));
  const amount = (minor: number, currency: string) => (isCurrencyCode(currency) ? toInputValue(minor, currency) : String(minor));
  const rows: Array<Array<string | number>> = [["Date", "Direction", "Category", "Amount", "Currency", "Method", "Reference", "Machine", "Technician", "Supplier", "Note", "Source", "Entry"],
    ...entries.map((entry) => [calendarDayAt(entry.occurredAt, space.timezone), entry.direction === "IN" ? "In" : "Out", CATEGORY_LABELS[entry.category] ?? entry.category,
      format === "xlsx" ? Number(amount(entry.amountMinor, entry.currency)) : amount(entry.amountMinor, entry.currency), entry.currency, METHOD_LABELS[entry.method] ?? entry.method,
      entry.reference, entry.machineId ? machine.get(entry.machineId) ?? "" : "", entry.technicianId ? technician.get(entry.technicianId) ?? "" : "", entry.supplier, entry.note,
      entry.sourceType, entry.id])];
  await recordAuditEvent({ action: "REPORT_EXPORTED", actorUserId: access.userId, spaceId: access.space.id, targetType: "FinanceEntry",
    metadata: { report: "finance", format, period: period.label, rows: entries.length } });
  const name = `finance-${period.label.replace(/[^A-Za-z0-9-]+/g, "-")}`;
  const headers = { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="${name}.${format}"` };
  if (format === "xlsx") return new Response(new Uint8Array(buildXlsx("Finance", rows)), { headers: { ...headers, "Content-Type": XLSX_TYPE } });
  return new Response(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
}
