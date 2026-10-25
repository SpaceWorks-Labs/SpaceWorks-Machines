import Link from "next/link";
import type { Metadata } from "next";
import { loadReportsView } from "@/lib/views/app__dashboard__spaceSlug__reports__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { Bars } from "@/components/reports/Bars";
import { Button } from "@/components/ui/button";
import { Chip, StatTile } from "@/components/ui/display";
import { DateRangeForm } from "@/components/forms/FilterForms";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";
import { WARRANTY_LABELS } from "@/lib/upkeep/labels";
import { SpendSections } from "@/components/reports/SpendSections";
import { CollapsibleSection } from "@/components/ui/collapsible";

export const metadata: Metadata = { title: "Reports", robots: { index: false, follow: false } };

const minutes = (value: number | null) => value === null ? "Not enough data" : value >= 120 ? `${Math.round(value / 6) / 10} h` : `${value} min`;
const percent = (value: number | null) => value === null ? "Not enough data" : `${Math.round(value * 1000) / 10} %`;

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { space, range, reports, spend, showMoney } = await loadReportsView({ params, searchParams });
  const money = (value: number, currency = space.currency) => isCurrencyCode(currency) ? formatMoney(value, currency, space.locale ?? undefined) : `${value} ${currency}`;
  const csv = (kind: string) => `/api/spaces/${space.slug}/reports/${kind}?from=${range.from}&to=${range.to}`;
  const exportLink = (kind: string) => <span className="flex gap-2"><Button asChild size="sm" variant="secondary"><a href={csv(kind)} download>Export CSV</a></Button>
    <Button asChild size="sm" variant="secondary"><a href={`${csv(kind)}&format=xlsx`} download>Excel</a></Button></span>;
  return (
    <div className="flex flex-col gap-7 pb-4">
      <SpacePageHeader space={space} title="Reports" description="Jobs, machine use, consumables, money and upkeep over a period." />
      <DateRangeForm from={range.from} to={range.to} label="Report period" submit="Show period" />

      <CollapsibleSection id="reports-jobs" label="Jobs report" title="Jobs" description={`${reports.jobs.total} submitted in this period.`} action={exportLink("jobs")}>
        <div className="mb-5 grid grid-cols-2 gap-4"><StatTile label="Failure rate" value={percent(reports.jobs.failureRate)} /><StatTile label="Average turnaround" value={minutes(reports.jobs.turnaroundMinutes)} /></div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div><h3 className="mb-2 text-label">By status</h3><Bars label="Jobs by status" rows={reports.jobs.byStatus.map((row) => ({ label: row.label.charAt(0) + row.label.slice(1).toLowerCase(), value: row.total }))} /></div>
          <div><h3 className="mb-2 text-label">By type</h3><Bars label="Jobs by type" rows={reports.jobs.byType.map((row) => ({ label: row.label, value: row.total }))} /></div>
          <div><h3 className="mb-2 text-label">By machine</h3><Bars label="Jobs by machine" rows={reports.jobs.byMachine.map((row) => ({ label: row.label, value: row.total }))} /></div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="reports-utilisation" label="Machine utilisation report" title="Machine utilisation" action={exportLink("utilisation")}>
        <Table label="Machine utilisation"><THead><TR><TH>Machine</TH><TH>Hours run</TH><TH>Runs</TH><TH>Availability</TH><TH>Downtime</TH></TR></THead>
          <TBody>{reports.utilisation.map((row) => <TR key={row.machineId}><TD>{row.name}</TD><TD>{Math.round(row.hoursRun * 10) / 10}</TD><TD>{row.runs}</TD><TD>{percent(row.availability)}</TD><TD>{minutes(row.downtimeMinutes)}</TD></TR>)}</TBody></Table>
      </CollapsibleSection>

      <CollapsibleSection id="reports-consumables" label="Consumables report" title="Consumables used" action={exportLink("consumables")}>
        <Bars label="Consumables used" rows={reports.consumables.map((row) => ({ label: `${row.label} (${row.unit.toLowerCase()})`, value: row.used }))} />
      </CollapsibleSection>

      {reports.revenue ? <CollapsibleSection id="reports-revenue" label="Revenue report" title="Revenue" description="Each currency is totalled on its own." action={exportLink("revenue")}>
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">{reports.revenue.currencies.flatMap((row) => [
          <StatTile key={`${row.currency}-paid`} label={`Paid (${row.currency})`} value={money(row.paid, row.currency)} />,
          <StatTile key={`${row.currency}-pending`} label={`Pending (${row.currency})`} value={money(row.pending, row.currency)} />,
          <StatTile key={`${row.currency}-refunded`} label={`Refunded (${row.currency})`} value={money(row.refunded, row.currency)} />,
          <StatTile key={`${row.currency}-waived`} label={`Waived (${row.currency})`} value={money(row.waived, row.currency)} />])}</div>
        <div className="grid gap-6 lg:grid-cols-3">
          {([["By method", reports.revenue.byMethod], ["By type", reports.revenue.byType], ["By machine", reports.revenue.byMachine]] as const).map(([title, rows]) => (
            <div key={title}><h3 className="mb-2 text-label">{title}</h3><Bars label={`Paid ${title.toLowerCase()}`} rows={rows.map((row) => ({ label: `${row.label} · ${row.currency}`, value: row.amount, display: money(row.amount, row.currency) }))} /></div>))}
        </div>
      </CollapsibleSection> : null}

      <CollapsibleSection id="reports-maintenance" label="Maintenance report" title="Maintenance" action={exportLink("maintenance")}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatTile label="Records" value={reports.maintenance.logs} />{showMoney ? <StatTile label="Cost" value={reports.maintenance.cost === null ? "None recorded" : money(reports.maintenance.cost)} /> : null}
          <StatTile label="Overdue now" value={reports.maintenance.overdue} tone={reports.maintenance.overdue ? "attention" : "default"} />
          <StatTile label="Mean time between faults" value={minutes(reports.maintenance.mtbfMinutes)} /><StatTile label="Mean time to repair" value={minutes(reports.maintenance.mttrMinutes)} />
        </div>
      </CollapsibleSection>

      {spend ? <SpendSections spend={spend} money={money} exportLink={exportLink} /> : null}

      <CollapsibleSection id="reports-warranty" label="Warranty report" title="Warranties" action={exportLink("warranty")} count={reports.warranty.length}>
        <Table label="Warranties"><THead><TR><TH>Machine</TH><TH>Vendor</TH><TH>Contract</TH><TH>Expires</TH><TH>State</TH></TR></THead>
          <TBody>{reports.warranty.map((row) => <TR key={row.machineSlug}><TD><Link className="underline" href={`/dashboard/${space.slug}/machines/${row.machineSlug}/upkeep`}>{row.machine}</Link></TD>
            <TD>{row.vendor}</TD><TD>{row.contract}</TD><TD>{row.expiresOn ?? "Not set"}</TD><TD><Chip size="sm" tone={WARRANTY_LABELS[row.state].tone}>{WARRANTY_LABELS[row.state].label}</Chip></TD></TR>)}</TBody></Table>
      </CollapsibleSection>
    </div>
  );
}
