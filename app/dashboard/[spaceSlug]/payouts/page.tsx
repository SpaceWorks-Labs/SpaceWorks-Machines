import Link from "next/link";
import type { Metadata } from "next";
import { loadPayoutsView } from "@/lib/views/app__dashboard__spaceSlug__payouts__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { DateRangeForm } from "@/components/forms/FilterForms";
import { PAYOUT_METHOD_LABELS } from "@/components/repairs/labels";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";

export const metadata: Metadata = { title: "Payouts", robots: { index: false, follow: false } };

export default async function PayoutsPage(props: Parameters<typeof loadPayoutsView>[0]) {
  const { space, range, payouts } = await loadPayoutsView(props);
  const money = (value: number, currency: string) => isCurrencyCode(currency) ? formatMoney(value, currency, space.locale ?? undefined) : `${value} ${currency}`;
  const exportHref = (format: string) => `/api/spaces/${space.slug}/reports/repairs?from=${range.from}&to=${range.to}${format === "xlsx" ? "&format=xlsx" : ""}`;
  return <div className="flex flex-col gap-7 pb-4">
    <SpacePageHeader space={space} title="Payouts" description="Money paid to technicians for repairs. Payouts are never changed; reverse one from Finance if it was wrong." />
    <DateRangeForm from={range.from} to={range.to} label="Payout period" submit="Show period" />
    <Card as="section" aria-label="Payouts">
      <CardHeader title="Payouts" action={<div className="flex gap-2"><Button asChild size="sm" variant="secondary"><a href={exportHref("csv")} download>Repair spend CSV</a></Button>
        <Button asChild size="sm" variant="secondary"><a href={exportHref("xlsx")} download>Excel</a></Button></div>} />
      {payouts.length ? <Table label="Payout ledger"><THead><TR><TH>Paid on</TH><TH>Technician</TH><TH>Repair</TH><TH>Amount</TH><TH>Method</TH><TH>Reference</TH></TR></THead>
        <TBody>{payouts.map((row) => <TR key={row.id}><TD>{row.paidAt.slice(0, 10)}</TD><TD>{row.technician}</TD>
          <TD><Link className="underline-offset-4 hover:underline" href={`/dashboard/${space.slug}/maintenance/faults/${row.fault.number}`}>{row.fault.label} {row.fault.title}</Link> <span className="text-ink-muted">({row.machine})</span></TD>
          <TD>{money(row.amount, row.currency)}</TD><TD>{PAYOUT_METHOD_LABELS[row.method]}</TD><TD>{row.reference || "–"}</TD></TR>)}</TBody></Table>
        : <EmptyState title="No payouts in this period">Approve the amount on a repair and record what you paid from its fault page.</EmptyState>}
    </Card>
  </div>;
}
