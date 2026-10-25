import Link from "next/link";
import type { Metadata } from "next";
import { loadToBuyView } from "@/lib/views/app__dashboard__spaceSlug__to-buy__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { ToBuyRequestDialog, ToBuyStepButtons } from "@/components/repairs/ToBuyActions";
import { TO_BUY_STATUS_LABELS, toBuyNumber } from "@/components/repairs/labels";
import { buttonClasses } from "@/components/ui/button";
import { Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";

export const metadata: Metadata = { title: "To buy", robots: { index: false, follow: false } };

export default async function ToBuyPage(props: Parameters<typeof loadToBuyView>[0]) {
  const view = await loadToBuyView(props);
  const { space } = view;
  const money = (value: number | null, currency: string | null) => value == null || !currency ? "–" : isCurrencyCode(currency) ? formatMoney(value, currency, space.locale ?? undefined) : String(value);
  return <div className="flex flex-col gap-7 pb-4">
    <SpacePageHeader space={space} title="To buy" description="Parts and consumables to buy: asked for, approved, bought and received. Receiving a consumable restocks its pool."
      actions={view.canRequest ? <ToBuyRequestDialog spaceSlug={space.slug} machines={view.machines} pools={view.pools} /> : null} />
    <nav aria-label="Filter" className="flex gap-2">
      <Link href={`/dashboard/${space.slug}/to-buy`} aria-current={view.open ? "page" : undefined} className={buttonClasses({ size: "sm", variant: view.open ? "primary" : "secondary" })}>Open</Link>
      <Link href={`/dashboard/${space.slug}/to-buy?status=all`} aria-current={view.open ? undefined : "page"} className={buttonClasses({ size: "sm", variant: view.open ? "secondary" : "primary" })}>Everything</Link>
    </nav>
    {view.items.length ? <Table label="To-buy items"><THead><TR><TH>Item</TH><TH>Quantity</TH><TH>For</TH><TH>Status</TH>{view.showMoney ? <TH>Spent</TH> : null}{view.canManage ? <TH><span className="sr-only">Actions</span></TH> : null}</TR></THead>
      <TBody>{view.items.map((item) => <TR key={item.id}>
        <TD><span className="font-bold">{toBuyNumber(item.number)} {item.title}</span>{item.note ? <span className="block text-caption text-ink-muted">{item.note}</span> : null}</TD>
        <TD>{item.quantity} {item.unit}</TD>
        <TD>{[item.machine, item.pool].filter(Boolean).join(" · ") || "–"}</TD>
        <TD><Chip size="sm">{TO_BUY_STATUS_LABELS[item.status]}</Chip></TD>
        {view.showMoney ? <TD>{money(item.amount, item.currency)}{item.supplier ? <span className="block text-caption text-ink-muted">{item.supplier}</span> : null}</TD> : null}
        {view.canManage ? <TD><ToBuyStepButtons spaceSlug={space.slug} itemId={item.id} status={item.status} currency={space.currency} title={item.title} /></TD> : null}
      </TR>)}</TBody></Table>
      : <EmptyState title={view.open ? "Nothing to buy" : "No items yet"}>Ask for a part or a consumable when a repair or a low pool needs one.</EmptyState>}
  </div>;
}
