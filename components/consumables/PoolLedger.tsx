import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { Table, THead, TBody, TR, TH, TD, TruncatedTD } from "@/components/ui/table";
import { formatQuantity } from "@/lib/consumables/math";
import type { ConsumableAdjustmentKind } from "@prisma/client";

const KINDS: Record<ConsumableAdjustmentKind, string> = {
  RESTOCK: "Restock", CORRECTION: "Correction", RESERVE: "Reserved for job", RECONCILE: "Job reconciliation",
  RELEASE: "Reservation released", MANUAL: "Manual use", RETIRE: "Retirement",
};
export type LedgerEntry = { id: string; kind: ConsumableAdjustmentKind; delta: string; balanceAfter: string; actor: string; reason: string; time: string };

export function PoolLedger({ spaceSlug, poolId, unit, entries, page, hasMore, timezone }: {
  spaceSlug: string; poolId: string; unit: string; entries: LedgerEntry[]; page: number; hasMore: boolean; timezone: string;
}) {
  const href = (page: number) => `/dashboard/${spaceSlug}/consumables/${poolId}?page=${page}`;
  return <section aria-label="Stock ledger" className="flex flex-col gap-4">
    <div><h2 className="text-h4 text-ink">Stock ledger</h2>
    <p className="mt-1 text-body-ui text-ink-muted">Newest first. Entries are append-only; use a correction to change a balance. Times are shown in {timezone}.</p></div>
    {entries.length ? <Table label="Stock ledger" long><THead><TR><TH>Kind</TH><TH className="text-right">Change ({unit})</TH><TH className="text-right">Balance after ({unit})</TH><TH>Actor</TH><TH>Reason</TH><TH>Time</TH></TR></THead>
      <TBody>{entries.map((entry) => <TR key={entry.id}>
        <TD>{KINDS[entry.kind]}</TD><TD className="whitespace-nowrap text-right tabular-nums">{entry.delta.startsWith("-") ? "" : "+"}{formatQuantity(entry.delta)}</TD><TD className="text-right tabular-nums">{formatQuantity(entry.balanceAfter)}</TD>
        <TruncatedTD text={entry.actor} className="max-w-[12rem]" /><TD className="min-w-48 whitespace-pre-wrap break-words">{entry.reason || "No reason recorded"}</TD>
        <TD className="whitespace-nowrap"><time dateTime={entry.time}>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(entry.time))}</time></TD>
      </TR>)}</TBody>
    </Table> : <EmptyState title="No ledger entries on this page">{page === 1 ? "Restocks, corrections and stock use will appear here." : "Go back to the previous page to see earlier results."}</EmptyState>}
    <nav aria-label="Ledger pages" className="flex flex-wrap items-center gap-3">
      {page > 1 ? <Button asChild variant="secondary" size="sm"><Link href={href(page - 1)}>Newer entries</Link></Button> : null}
      <span className="text-caption text-ink-muted">Page {page}</span>
      {hasMore ? <Button asChild variant="secondary" size="sm"><Link href={href(page + 1)}>Older entries</Link></Button> : null}
    </nav>
  </section>;
}
