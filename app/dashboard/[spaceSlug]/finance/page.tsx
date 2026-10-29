import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { loadFinanceView } from "@/lib/views/app__dashboard__spaceSlug__finance__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { FinanceBreakdowns, FinanceEntries } from "@/components/finance/FinanceTables";
import { ManualEntryDialog } from "@/components/finance/ManualEntryDialog";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState, StatTile } from "@/components/ui/display";
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
      <span className="flex flex-wrap items-center gap-2 sm:mx-2">
        <Link className={buttonClasses({ size: "sm", variant: "secondary" })} href={href(period.kind, period.previous)} aria-label="Previous period"><ChevronLeft aria-hidden className="size-4" />Previous</Link>
        <span aria-live="polite" className="text-label text-ink">{period.label}</span>
        <Link className={buttonClasses({ size: "sm", variant: "secondary" })} href={href(period.kind, period.next)} aria-label="Next period">Next<ChevronRight aria-hidden className="size-4" /></Link>
      </span>
      <span className="flex flex-wrap gap-2 sm:ml-auto">
        <Button asChild size="sm" variant="secondary"><a href={exportHref("csv")} download><Download aria-hidden className="size-4" />Export CSV</a></Button>
        <Button asChild size="sm" variant="secondary"><a href={exportHref("xlsx")} download><Download aria-hidden className="size-4" />Export Excel</a></Button>
      </span>
    </nav>
    <section aria-label="Totals" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {view.summary.totals.length ? view.summary.totals.flatMap((total) => [
        <StatTile key={`${total.currency}-in`} label={`Money in (${total.currency})`} value={money(total.income, total.currency)} />,
        <StatTile key={`${total.currency}-out`} label={`Money out (${total.currency})`} value={money(total.spending, total.currency)} />,
        <StatTile key={`${total.currency}-net`} label={`Net (${total.currency})`} value={money(total.net, total.currency)} tone={total.net < 0 ? "attention" : "default"} />,
      ]) : <EmptyState mood="sleepy" className="sm:col-span-3" title="No money in or out">Nothing was paid in or out in this period.</EmptyState>}
    </section>
    <FinanceBreakdowns summary={view.summary} currencyLocale={space.locale ?? undefined} />
    <FinanceEntries spaceSlug={space.slug} entries={view.entries} count={view.count} canManage={view.canManage} locale={space.locale ?? undefined} timeZone={space.timezone} />
  </div>;
}
