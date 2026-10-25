import type { ReactNode } from "react";

import { Table, TBody, TD, TH, THead, TR, TruncatedTD } from "@/components/ui/table";
import { PAYOUT_METHOD_LABELS } from "@/components/repairs/labels";
import type { SpendReports } from "@/lib/reports/spend";
import { CollapsibleSection } from "@/components/ui/collapsible";

/** What each machine cost to keep running, and every repair payout: the machine manager's reports. */
export function SpendSections({ spend, money, exportLink }: { spend: SpendReports; money: (value: number, currency?: string) => string; exportLink: (kind: string) => ReactNode }) {
  return <>
    <CollapsibleSection id="reports-spend" label="Machine spend report" title="Spend per machine" description="Repairs, maintenance, parts and consumables bought for each machine." action={exportLink("spend")} count={spend.spend.length}>
      {spend.spend.length ? <Table label="Spend per machine"><THead><TR><TH>Machine</TH><TH className="text-right">Repairs</TH><TH className="text-right">Maintenance</TH><TH className="text-right">Parts</TH><TH className="text-right">Consumables</TH><TH className="text-right">Total</TH></TR></THead>
        <TBody>{spend.spend.map((row) => <TR key={`${row.machine}-${row.currency}`} className="[&>td:not(:first-child)]:whitespace-nowrap [&>td:not(:first-child)]:text-right [&>td:not(:first-child)]:tabular-nums"><TruncatedTD text={row.machine} /><TD>{money(row.repairs, row.currency)}</TD><TD>{money(row.maintenance, row.currency)}</TD>
          <TD>{money(row.parts, row.currency)}</TD><TD>{money(row.consumables, row.currency)}</TD><TD className="font-bold">{money(row.total, row.currency)}</TD></TR>)}</TBody></Table>
        : <p className="text-body-ui text-ink-secondary">Nothing spent on machines in this period.</p>}
    </CollapsibleSection>
    <CollapsibleSection id="reports-repairs" label="Repair spend report" title="Repair spend" description="Payouts to technicians, by repair and month." action={exportLink("repairs")} count={spend.repairs.length}>
      {spend.repairs.length ? <Table label="Repair spend" long><THead><TR><TH>Paid on</TH><TH>Repair</TH><TH>Machine</TH><TH>Technician</TH><TH>Method</TH><TH className="text-right">Amount</TH></TR></THead>
        <TBody>{spend.repairs.map((row, index) => <TR key={`${row.paidOn}-${index}`}><TD className="whitespace-nowrap tabular-nums">{row.paidOn}</TD><TruncatedTD text={row.fault} /><TruncatedTD text={row.machine} /><TruncatedTD text={row.technician} />
          <TD>{PAYOUT_METHOD_LABELS[row.method]}</TD><TD className="whitespace-nowrap text-right tabular-nums">{money(row.amount, row.currency)}</TD></TR>)}</TBody></Table>
        : <p className="text-body-ui text-ink-secondary">No repair payouts in this period.</p>}
    </CollapsibleSection>
  </>;
}
