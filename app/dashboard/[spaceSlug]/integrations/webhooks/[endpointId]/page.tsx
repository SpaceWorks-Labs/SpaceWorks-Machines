import Link from "next/link";
import type { Metadata } from "next";
import { loadWebhookDeliveriesView } from "@/lib/views/app__dashboard__spaceSlug__integrations__webhooks__endpointId__page";
import { redeliverWebhookAction } from "@/app/actions/integrations";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionDialog } from "@/components/upkeep/ActionDialog";
import { formatDayTime } from "@/lib/format/datetime";

export const metadata: Metadata = { title: "Webhook deliveries", robots: { index: false, follow: false } };
const TONE = { SUCCEEDED: "success", FAILED: "danger", PENDING: "warning" } as const;
const WORD = { SUCCEEDED: "Delivered", FAILED: "Failed", PENDING: "Pending" } as const;

export default async function WebhookDeliveriesPage({ params }: { params: Promise<{ spaceSlug: string; endpointId: string }> }) {
  const { space, endpoint, deliveries } = await loadWebhookDeliveriesView({ params });
  const when = (value: string) => formatDayTime(value, space.timezone);
  return (
    <div className="flex flex-col gap-7 pb-4">
      <div><Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/integrations`}>Back to integrations</Link></Button></div>
      <SpacePageHeader space={space} title={`Deliveries to ${endpoint.host}`} description="The last 100 deliveries. Retries happen after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours." />
      {deliveries.length ? <Table label="Deliveries" long><THead><TR><TH>Event</TH><TH>Sent</TH><TH>State</TH><TH>Response</TH><TH><span className="sr-only">Actions</span></TH></TR></THead>
        <TBody>{deliveries.map((row) => <TR key={row.id}>
          <TD><code>{row.event}</code><details className="mt-1"><summary className="cursor-pointer text-caption text-ink-muted">Payload</summary><pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-all text-caption">{row.payload}</pre></details></TD>
          <TD className="whitespace-nowrap">{when(row.createdAt)}<span className="block text-caption text-ink-muted">{row.attempts} {row.attempts === 1 ? "attempt" : "attempts"}</span></TD>
          <TD><Chip size="sm" tone={TONE[row.status]}>{WORD[row.status]}</Chip>{row.status === "PENDING" && row.nextAttemptAt ? <span className="block text-caption text-ink-muted">Next try {when(row.nextAttemptAt)}</span> : null}</TD>
          <TD>{row.responseStatus ?? "None"}{row.lastError ? <span className="block max-w-xs break-words text-caption text-danger-fg">{row.lastError}</span> : null}</TD>
          <TD>{row.status !== "PENDING" ? <ActionDialog action={redeliverWebhookAction} fixed={{ spaceSlug: space.slug, deliveryId: row.id }} trigger="Send again" title="Send this delivery again" submitLabel="Send again" success="Delivery queued">
            <p className="text-body-ui">Send {row.event} to {endpoint.host} again, with the same event id?</p></ActionDialog> : null}</TD>
        </TR>)}</TBody></Table> : <EmptyState title="No deliveries yet">Deliveries appear here when a subscribed event happens, or after a test.</EmptyState>}
    </div>
  );
}
