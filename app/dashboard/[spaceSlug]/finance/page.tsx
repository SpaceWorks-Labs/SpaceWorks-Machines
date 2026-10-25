import Link from "next/link";
import type { Metadata } from "next";
import { loadFinanceView } from "@/lib/views/app__dashboard__spaceSlug__finance__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { FinanceBreakdowns, FinanceEntries } from "@/components/finance/FinanceTables";
import { ManualEntryDialog } from "@/components/finance/ManualEntryDialog";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, StatTile } from "@/components/ui/display";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";

export const metadata: Metadata = { title: "Finance", robots: { index: false, follow: false } };

const PERIODS = [["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Financial year"]] as const;

export default async function FinancePage(props: Parameters<typeof loadFinanceView>[0]) {
  const view = await loadFinanceView(props);
  const { space, period } = view;
  const money = (value: number, currency: string) => isCurrencyCode(currency) ? formatMoney(value, currency, space.locale ?? undefined) : `${value} ${currency}`;
  const href = (kind: string, on: string) => `/dashboard/${space.slug}/finance?period=${kind}&on=${on}`;
  const exportHref = (format: string) => `/api/spaces/${space.slug}/finance/export?period=${period.kind}&on=${period.anchor}&format=${format}`;
  return <div className="flex flex-col gap-7 pb-4">
    <SpacePageHeader space={space} title="Finance" description="Every payment in and out, posted as it happens: job payments and refunds, repairs, maintenance, purchases and your own entries."
      actions={view.canManage ? <ManualEntryDialog spaceSlug={space.slug} currency={space.currency} machines={view.machines} /> : null} />
    <nav aria-label="Finance period" className="flex flex-wrap items-center gap-2">
      {PERIODS.map(([kind, label]) => <Link key={kind} href={href(kind, period.anchor)} aria-current={period.kind === kind ? "page" : undefined}
        className={buttonClasses({ size: "sm", variant: period.kind === kind ? "primary" : "secondary" })}>{label}</Link>)}
      <span className="mx-2 text-body-ui font-bold">{period.label}</span>
      <Link className={buttonClasses({ size: "sm", variant: "secondary" })} href={href(period.kind, period.previous)}>Previous</Link>
      <Link className={buttonClasses({ size: "sm", variant: "secondary" })} href={href(period.kind, period.next)}>Next</Link>
      <span className="ml-auto flex gap-2">
        <Button asChild size="sm" variant="secondary"><a href={exportHref("csv")} download>Export CSV</a></Button>
        <Button asChild size="sm" variant="secondary"><a href={exportHref("xlsx")} download>Export Excel</a></Button>
      </span>
    </nav>
    <section aria-label="Totals" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {view.summary.totals.length ? view.summary.totals.flatMap((total) => [
        <StatTile key={`${total.currency}-in`} label={`Money in (${total.currency})`} value={money(total.income, total.currency)} />,
        <StatTile key={`${total.currency}-out`} label={`Money out (${total.currency})`} value={money(total.spending, total.currency)} />,
        <StatTile key={`${total.currency}-net`} label={`Net (${total.currency})`} value={money(total.net, total.currency)} tone={total.net < 0 ? "attention" : "default"} />,
      ]) : <Card className="sm:col-span-3"><p className="text-ink-secondary">Nothing was paid in or out in this period.</p></Card>}
    </section>
    <FinanceBreakdowns summary={view.summary} currencyLocale={space.locale ?? undefined} />
    <FinanceEntries spaceSlug={space.slug} entries={view.entries} count={view.count} canManage={view.canManage} locale={space.locale ?? undefined} />
  </div>;
}
