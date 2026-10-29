import Link from "next/link";
import type { Metadata } from "next";
import { loadPayoutsView } from "@/lib/views/app__dashboard__spaceSlug__payouts__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { DateRangeForm } from "@/components/forms/FilterForms";
import { PAYOUT_METHOD_LABELS } from "@/components/repairs/labels";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR, TruncatedTD } from "@/components/ui/table";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";
import { calendarDayAt } from "@/lib/calendarDay";

export const metadata: Metadata = { title: "Payouts", robots: { index: false, follow: false } };

export default async function PayoutsPage(props: Parameters<typeof loadPayoutsView>[0]) {
  const { space, range, payouts } = await loadPayoutsView(props);
  const money = (value: number, currency: string) => isCurrencyCode(currency) ? formatMoney(value, currency, space.locale ?? undefined) : `${value} ${currency}`;
  const exportHref = (format: string) => `/api/spaces/${space.slug}/reports/repairs?from=${range.from}&to=${range.to}${format === "xlsx" ? "&format=xlsx" : ""}`;
  return <div className="flex flex-col gap-7 pb-4">
    <SpacePageHeader space={space} title="Payouts" description="Money paid to technicians for repairs. Payouts are never changed; reverse one from Finance if it was wrong." />
    <DateRangeForm from={range.from} to={range.to} label="Payout period" submit="Show period" />
    <Card as="section" aria-label="Payouts">
      <CardHeader title="Payouts" description="Repair spend exports cover the same period." action={<div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="secondary"><a href={exportHref("csv")} download>Export CSV</a></Button>
        <Button asChild size="sm" variant="secondary"><a href={exportHref("xlsx")} download>Export Excel</a></Button></div>} />
      {payouts.length ? <Table label="Payout ledger" long><THead><TR><TH>Paid on</TH><TH>Technician</TH><TH>Repair</TH><TH className="text-right">Amount</TH><TH>Method</TH><TH>Reference</TH></TR></THead>
        <TBody>{payouts.map((row) => <TR key={row.id}><TD className="whitespace-nowrap tabular-nums">{calendarDayAt(new Date(row.paidAt), space.timezone)}</TD><TruncatedTD text={row.technician} className="max-w-[12rem]" />
          <TD className="min-w-[14rem]"><Link className="underline-offset-4 hover:underline" href={`/dashboard/${space.slug}/maintenance/faults/${row.fault.number}`}>{row.fault.label} {row.fault.title}</Link> <span className="text-ink-muted">({row.machine})</span></TD>
          <TD className="whitespace-nowrap text-right tabular-nums">{money(row.amount, row.currency)}</TD><TD className="whitespace-nowrap">{PAYOUT_METHOD_LABELS[row.method]}</TD><TruncatedTD text={row.reference || "–"} className="max-w-[12rem]" /></TR>)}</TBody></Table>
        : <EmptyState title="No payouts in this period" mood="sleepy" className="border-0 px-0">Approve the amount on a repair and record what you paid from its fault page.</EmptyState>}
    </Card>
  </div>;
}
