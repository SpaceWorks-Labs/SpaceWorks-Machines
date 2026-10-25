import { spaceActionAccess } from "@/lib/permissions";
import { listPayments } from "@/lib/payments/jobs/list";
import { csvCell, jobNumber } from "@/lib/jobs/presentation";
import { isCurrencyCode, toInputValue } from "@/lib/money/currencies";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ spaceSlug: string }> }) {
  const access = await spaceActionAccess((await params).spaceSlug, "payments.view");
  if (!access.ok) return new Response("Not found.", { status: 404 });
  const query = new URL(request.url).searchParams;
  const rows = await listPayments(access.space.id, { status: query.get("status") ?? "", method: query.get("method") ?? "" });
  const amount = (value: number, currency: string) => isCurrencyCode(currency) ? toInputValue(value, currency) : String(value);
  const csv = [["Job", "Title", "Kind", "Amount", "Currency", "Status", "Method", "Reference", "Refunded", "Created"],
    ...rows.map((p) => [jobNumber(p.job.number), p.job.title, p.kind, amount(p.amount, p.currency), p.currency, p.status, p.method, p.reference, amount(p.amountRefunded, p.currency), p.createdAt])]
    .map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="payments.csv"', "Cache-Control": "private, no-store" } });
}
