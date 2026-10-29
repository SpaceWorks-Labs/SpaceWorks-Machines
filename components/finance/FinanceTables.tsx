import Link from "next/link";
import { Card, CardHeader, Chip } from "@/components/ui/display";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { Table, TBody, TD, TH, THead, TR, TruncatedTD } from "@/components/ui/table";
import { ReverseEntryButton } from "@/components/finance/ReverseEntryButton";
import { CATEGORY_LABELS, METHOD_LABELS, type Breakdown, type FinanceSummary } from "@/lib/finance/summary";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";
import { calendarDayAt } from "@/lib/calendarDay";

const money = (value: number, currency: string, locale?: string) => isCurrencyCode(currency) ? formatMoney(value, currency, locale) : `${value} ${currency}`;

function BreakdownTable({ title, rows, labels, locale }: { title: string; rows: Breakdown[]; labels?: Record<string, string>; locale?: string }) {
  return <CollapsibleSection id={`finance-${title.toLowerCase().replace(/\W+/g, "-")}`} title={title} count={rows.length}>
    {rows.length ? <Table label={`${title}, in and out`}><THead><TR><TH>{title.replace(/^By /, "").replace(/^./, (c) => c.toUpperCase())}</TH><TH className="text-right">In</TH><TH className="text-right">Out</TH></TR></THead>
      <TBody>{rows.map((row) => <TR key={`${row.label}-${row.currency}`}><TruncatedTD text={labels?.[row.label] ?? row.label} /><TD className="whitespace-nowrap text-right tabular-nums">{row.income ? money(row.income, row.currency, locale) : "–"}</TD>
        <TD className="whitespace-nowrap text-right tabular-nums">{row.spending ? money(row.spending, row.currency, locale) : "–"}</TD></TR>)}</TBody></Table>
      : <p className="text-body-ui text-ink-secondary">Nothing in this period.</p>}
  </CollapsibleSection>;
}

export function FinanceBreakdowns({ summary, currencyLocale }: { summary: FinanceSummary; currencyLocale?: string }) {
  return <div className="grid items-start gap-6 lg:grid-cols-2">
    <BreakdownTable title="By category" rows={summary.byCategory} labels={CATEGORY_LABELS} locale={currencyLocale} />
    <BreakdownTable title="By method" rows={summary.byMethod} labels={METHOD_LABELS} locale={currencyLocale} />
    <BreakdownTable title="By machine" rows={summary.byMachine} locale={currencyLocale} />
    <BreakdownTable title="By technician" rows={summary.byTechnician} locale={currencyLocale} />
    <BreakdownTable title="By supplier" rows={summary.bySupplier} locale={currencyLocale} />
  </div>;
}

type Entry = { id: string; occurredAt: string; direction: string; category: string; amountMinor: number; currency: string; method: string; reference: string;
  note: string; machine: string | null; technician: string | null; supplier: string; href: string | null; reversible: boolean };

export function FinanceEntries({ spaceSlug, entries, count, canManage, locale, timeZone = "UTC" }: { spaceSlug: string; entries: Entry[]; count: number; canManage: boolean; locale?: string; timeZone?: string }) {
  return <Card as="section" aria-label="Ledger entries">
    <CardHeader title="Ledger" description={count > entries.length ? `The newest ${entries.length} of ${count} entries; the export has them all.` : `${count} entries in this period.`} />
    {entries.length ? <Table label="Ledger" long><THead><TR><TH>Date</TH><TH>What</TH><TH className="text-right">Amount</TH><TH>Method</TH><TH>Details</TH>{canManage ? <TH><span className="sr-only">Actions</span></TH> : null}</TR></THead>
      <TBody>{entries.map((entry) => <TR key={entry.id}>
        <TD className="whitespace-nowrap tabular-nums">{calendarDayAt(new Date(entry.occurredAt), timeZone)}</TD>
        <TD>{entry.href ? <Link className="underline-offset-4 hover:underline" href={entry.href}>{CATEGORY_LABELS[entry.category] ?? entry.category}</Link> : CATEGORY_LABELS[entry.category] ?? entry.category}</TD>
        <TD className="whitespace-nowrap text-right tabular-nums"><Chip size="sm" tone={entry.direction === "IN" ? "success" : "neutral"}>{entry.direction === "IN" ? "In" : "Out"}</Chip> {money(entry.amountMinor, entry.currency, locale)}</TD>
        <TruncatedTD text={`${METHOD_LABELS[entry.method] ?? entry.method}${entry.reference ? ` · ${entry.reference}` : ""}`} className="max-w-[14rem]" />
        <TruncatedTD text={[entry.note, entry.machine, entry.technician, entry.supplier].filter(Boolean).join(" · ") || "–"} className="max-w-[20rem]" />
        {canManage ? <TD>{entry.reversible ? <ReverseEntryButton spaceSlug={spaceSlug} entryId={entry.id} /> : null}</TD> : null}
      </TR>)}</TBody></Table> : <p className="text-body-ui text-ink-secondary">No entries in this period.</p>}
  </Card>;
}
