import Link from "next/link";
import type { Metadata } from "next";
import { loadRepairsView } from "@/lib/views/app__dashboard__spaceSlug__repairs__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { AnswerRequestButtons } from "@/components/repairs/RepairActions";
import { PAYOUT_STATUS_LABELS } from "@/components/repairs/labels";
import { Chip, EmptyState } from "@/components/ui/display";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";
import { formatDate } from "@/lib/format/datetime";
import { FAULT_STATUS_LABELS } from "@/lib/upkeep/labels";

export const metadata: Metadata = { title: "Repairs", robots: { index: false, follow: false } };

export default async function RepairsPage(props: Parameters<typeof loadRepairsView>[0]) {
  const view = await loadRepairsView(props);
  const { space } = view;
  const money = (value: number | null, none = "Not yet") => value == null ? <span className="text-ink-muted">{none}</span> : isCurrencyCode(space.currency) ? formatMoney(value, space.currency, space.locale ?? undefined) : String(value);
  const faultLink = (row: { number: number; label: string; title: string }) => <Link className="break-words font-bold underline underline-offset-4" href={`/dashboard/${space.slug}/maintenance/faults/${row.number}`}>{row.label} {row.title}</Link>;
  const nothing = !view.requests.length && !view.mine.length && !view.toCheck.length && !view.toPay.length;
  return <div className="flex flex-col gap-7 pb-4">
    <SpacePageHeader space={space} title="Repairs" description="Requests waiting for you, repairs you took, and repairs to check or pay." />
    {view.requests.length ? <CollapsibleSection id="repairs-requests" label="Requests for you" title="Asked to you" count={view.requests.length} description="The first technician to accept takes the repair.">
      <ul className="flex flex-col gap-3">{view.requests.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
        <span className="min-w-0">{faultLink(row)} <span className="text-ink-muted">on {row.machine} · expires {formatDate(row.expiresAt, "UTC")}</span></span>
        <AnswerRequestButtons spaceSlug={space.slug} requestId={row.id} /></li>)}</ul></CollapsibleSection> : null}
    {view.mine.length ? <CollapsibleSection id="repairs-mine" title="Your repairs" count={view.mine.length}>
      <Table label="Repairs you took"><THead><TR><TH>Fault</TH><TH>Machine</TH><TH>Status</TH><TH>You asked</TH><TH>Payment</TH></TR></THead>
        <TBody>{view.mine.map((row) => <TR key={row.number}><TD>{faultLink(row)}</TD><TD>{row.machine}</TD><TD><Chip size="sm" tone={FAULT_STATUS_LABELS[row.status]?.tone}>{FAULT_STATUS_LABELS[row.status]?.label ?? row.status}</Chip></TD>
          <TD className="whitespace-nowrap">{money(row.amountAsked, "Not given")}</TD><TD>{PAYOUT_STATUS_LABELS[row.payoutStatus]}</TD></TR>)}</TBody></Table></CollapsibleSection> : null}
    {view.toCheck.length ? <CollapsibleSection id="repairs-check" label="Repairs to check" title="Marked fixed, to check" count={view.toCheck.length}>
      <ul className="flex flex-col gap-2">{view.toCheck.map((row) => <li key={row.number} className="min-w-0">{faultLink(row)} <span className="text-ink-muted">on {row.machine}</span></li>)}</ul></CollapsibleSection> : null}
    {view.toPay.length ? <CollapsibleSection id="repairs-pay" label="Repairs to pay" title="To approve or pay" count={view.toPay.length}>
      <Table label="Amounts to approve or pay"><THead><TR><TH>Fault</TH><TH>Technician</TH><TH>Asked</TH><TH>Approved</TH><TH>Paid</TH></TR></THead>
        <TBody>{view.toPay.map((row) => <TR key={row.number}><TD>{faultLink(row)}</TD><TD>{row.technician}</TD><TD className="whitespace-nowrap">{money(row.amountAsked, "Not given")}</TD>
          <TD className="whitespace-nowrap">{money(row.approvedAmount)}</TD><TD className="whitespace-nowrap">{money(row.paidAmount)}</TD></TR>)}</TBody></Table></CollapsibleSection> : null}
    {nothing ? <EmptyState mood="sleepy" title="Nothing waiting">{view.isTechnician ? "Repair requests sent to you appear here." : "Ask technicians from a fault's page; their answers and fixes show up here."}</EmptyState> : null}
  </div>;
}
