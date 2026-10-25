import Link from "next/link";
import type { Metadata } from "next";
import { loadToBuyView } from "@/lib/views/app__dashboard__spaceSlug__to-buy__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { ToBuyRequestDialog, ToBuyStepButtons } from "@/components/repairs/ToBuyActions";
import { TO_BUY_STATUS_LABELS, toBuyNumber } from "@/components/repairs/labels";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";

export const metadata: Metadata = { title: "To buy", robots: { index: false, follow: false } };

export default async function ToBuyPage(props: Parameters<typeof loadToBuyView>[0]) {
  const view = await loadToBuyView(props);
  const { space } = view;
  const money = (value: number | null, currency: string | null) => value == null || !currency ? <span className="text-ink-muted">Not yet</span> : isCurrencyCode(currency) ? formatMoney(value, currency, space.locale ?? undefined) : String(value);
  return <div className="flex flex-col gap-7 pb-4">
    <SpacePageHeader space={space} title="To buy" description="Parts and consumables to buy: asked for, approved, bought and received. Receiving a consumable restocks its pool."
      actions={view.canRequest ? <ToBuyRequestDialog spaceSlug={space.slug} machines={view.machines} pools={view.pools} /> : null} />
    <nav aria-label="Show" className="flex flex-wrap gap-2">
      <Link href={`/dashboard/${space.slug}/to-buy`} aria-current={view.open ? "page" : undefined} className={cn(buttonClasses({ size: "sm", variant: "secondary" }), view.open && "border-ink bg-muted")}>Open</Link>
      <Link href={`/dashboard/${space.slug}/to-buy?status=all`} aria-current={view.open ? undefined : "page"} className={cn(buttonClasses({ size: "sm", variant: "secondary" }), !view.open && "border-ink bg-muted")}>Everything</Link>
    </nav>
    {view.items.length ? <Table label="To-buy items" long><THead><TR><TH>Item</TH><TH>Quantity</TH><TH>For</TH><TH>Status</TH>{view.showMoney ? <TH>Spent</TH> : null}{view.canManage ? <TH><span className="sr-only">Actions</span></TH> : null}</TR></THead>
      <TBody>{view.items.map((item) => <TR key={item.id}>
        <TD className="min-w-[14rem]"><span className="break-words font-bold">{toBuyNumber(item.number)} {item.title}</span>{item.note ? <span className="block break-words text-caption text-ink-muted">{item.note}</span> : null}</TD>
        <TD className="whitespace-nowrap">{item.quantity} {item.unit}</TD>
        <TD>{[item.machine, item.pool].filter(Boolean).join(" · ") || <span className="text-ink-muted">General</span>}</TD>
        <TD><Chip size="sm">{TO_BUY_STATUS_LABELS[item.status]}</Chip></TD>
        {view.showMoney ? <TD className="whitespace-nowrap">{money(item.amount, item.currency)}{item.supplier ? <span className="block text-caption text-ink-muted">{item.supplier}</span> : null}</TD> : null}
        {view.canManage ? <TD><ToBuyStepButtons spaceSlug={space.slug} itemId={item.id} status={item.status} currency={space.currency} title={item.title} /></TD> : null}
      </TR>)}</TBody></Table>
      : <EmptyState mood="sleepy" title={view.open ? "Nothing to buy" : "No items yet"}>Ask for a part or a consumable when a repair or a low pool needs one.</EmptyState>}
  </div>;
}
