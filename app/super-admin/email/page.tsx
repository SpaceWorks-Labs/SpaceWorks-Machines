import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminEmailView } from "@/lib/views/app__super-admin__email__page";
import Link from "next/link";
import { EMAIL_SERIES } from "@/lib/superAdminSeries";
import { formatShare, sumPoints } from "@/lib/superAdminInsights";
import { SparklineCard } from "@/components/super-admin/Sparkline";
import { AdminPanel } from "@/components/super-admin/AdminPanel";
import { Chip, EmptyState, PageHeader, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const WINDOW_DAYS = 14;


const seriesLabels: Record<(typeof EMAIL_SERIES)[number], string> = {
  queued: "Queued",
  sent: "Delivered",
  failed: "Failed",
};

export default async function SuperAdminEmailPage() {
  await requireSuperAdmin();
  const { totals, stuckPending, stuckProcessing, daily, kinds } = await loadSuperAdminEmailView();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Email"
        description="Email volume from the outbox queue. Recipients and message contents are never shown."
        actions={<Link href="/super-admin/operations" className="text-sm font-semibold text-ink underline underline-offset-4 hover:text-ink-secondary">Delivery controls in Operations</Link>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile className="rounded-xl" label="Queued now" value={totals.pending.toLocaleString()} />
        <StatTile className="rounded-xl" label="Waiting over 15 min" value={(stuckPending + stuckProcessing).toLocaleString()} tone={stuckPending + stuckProcessing > 0 ? "attention" : "default"} hint={stuckProcessing > 0 ? `${stuckProcessing} locked by a worker` : undefined} />
        <StatTile className="rounded-xl" label="Failed" value={totals.failed.toLocaleString()} tone={totals.failed > 0 ? "attention" : "default"} hint={`${formatShare(totals.failed, totals.total)} of all messages`} />
        <StatTile className="rounded-xl" label="Delivered (retained)" value={totals.sent.toLocaleString()} hint="Link-bearing messages are deleted after delivery" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {EMAIL_SERIES.map((name) => (
          <SparklineCard key={name} title={seriesLabels[name]} subtitle={`Last ${WINDOW_DAYS} days`} total={sumPoints(daily[name])} points={daily[name]} />
        ))}
      </div>

      <AdminPanel title="By message type" description="Every message still in the outbox, grouped by kind. Messages that carry a reset, verification or invite link are deleted once delivered, so delivered counts are a lower bound.">
        {kinds.length === 0 ? (
          <EmptyState mood="sleepy">No messages in the outbox.</EmptyState>
        ) : (
          <Table label="Outbox messages by kind">
            <THead>
              <tr>
                <TH>Kind</TH>
                <TH className="text-right">Queued</TH>
                <TH className="text-right">Sending</TH>
                <TH className="text-right">Delivered</TH>
                <TH className="text-right">Failed</TH>
                <TH className="text-right">Failure rate</TH>
              </tr>
            </THead>
            <TBody>
              {kinds.map((row) => (
                <TR key={row.kind}>
                  <TD className="tabular-nums text-sm">{row.kind}</TD>
                  <TD className="text-right tabular-nums">{row.pending.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{row.processing.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{row.sent.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{row.failed > 0 ? <Chip size="sm" tone="danger">{row.failed.toLocaleString()}</Chip> : "0"}</TD>
                  <TD className="text-right tabular-nums text-ink-secondary">{formatShare(row.failed, row.total)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </AdminPanel>

    </div>
  );
}
