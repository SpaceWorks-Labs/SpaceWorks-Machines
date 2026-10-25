import Link from "next/link";
import type { Metadata } from "next";
import { loadIntegrationsView } from "@/lib/views/app__dashboard__spaceSlug__integrations__page";
import { createApiKeyAction, createWebhookAction, deleteWebhookAction, revokeApiKeyAction, rotateWebhookSecretAction, testWebhookAction, updateWebhookAction } from "@/app/actions/integrations";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR, TruncatedTD } from "@/components/ui/table";
import { ActionDialog } from "@/components/upkeep/ActionDialog";
import { ApiKeyFields, WebhookFields } from "@/components/integrations/fields";
import { formatDate, formatDayTime } from "@/lib/format/datetime";

export const metadata: Metadata = { title: "Integrations", robots: { index: false, follow: false } };

export default async function IntegrationsPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const view = await loadIntegrationsView({ params });
  const { space } = view;
  const fixed = { spaceSlug: space.slug };
  const when = (value: string | null) => value ? formatDayTime(value, space.timezone) : "Never";
  return (
    <div className="flex flex-col gap-7 pb-4">
      <SpacePageHeader space={space} title="Integrations" description="Connect other tools through the REST API, webhooks and printer connections." />
      {view.canPrinters ? <Card as="section" aria-label="Printer connections">
        <CardHeader title="Printer connections" description={`${view.printers} connected. Set a connection up on each machine.`}
          action={<Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/machine-settings/printers`}>Manage connections</Link></Button>} />
      </Card> : null}
      {view.canManage ? <>
        <Card as="section" aria-label="API keys">
          <CardHeader title="API keys" description="Each key works for this space only, with the scopes you choose. Requests act as the person who created the key."
            action={<span className="flex flex-wrap gap-2"><Button asChild size="sm" variant="secondary"><a href="/api/v1/openapi.json">OpenAPI document</a></Button>
              <ActionDialog action={createApiKeyAction} fixed={fixed} arrays={["scopes"]} trigger="Create key" triggerVariant="primary" title="Create an API key" submitLabel="Create key" success="Key created"
                reveal={{ key: "token", title: "Copy your key now", note: "This is the only time the key is shown. Store it somewhere safe." }}><ApiKeyFields /></ActionDialog></span>} />
          {view.keys.length ? <Table label="API keys"><THead><TR><TH>Name</TH><TH>Key</TH><TH>Scopes</TH><TH>Last used</TH><TH>State</TH><TH><span className="sr-only">Actions</span></TH></TR></THead>
            <TBody>{view.keys.map((key) => <TR key={key.id}>
              <TruncatedTD text={key.name} /><TD className="whitespace-nowrap"><code>{key.prefix}_…</code></TD><TD className="min-w-40 text-caption">{key.scopes.join(", ")}</TD><TD className="whitespace-nowrap">{when(key.lastUsedAt)}</TD>
              <TD><Chip size="sm" tone={key.state === "Active" ? "success" : "neutral"}>{key.state}</Chip>{key.expiresAt && key.state === "Active" ? <span className="block text-caption text-ink-muted">Until {formatDate(key.expiresAt, space.timezone)}</span> : null}</TD>
              <TD>{key.state === "Active" ? <ActionDialog action={revokeApiKeyAction} fixed={{ ...fixed, keyId: key.id }} trigger="Revoke" triggerVariant="danger" title={`Revoke ${key.name}`} description="Anything using this key stops working at once." submitLabel="Revoke key" submitVariant="dangerSolid" success="Key revoked"><p className="text-body-ui">Revoke {key.prefix}_…?</p></ActionDialog> : null}</TD>
            </TR>)}</TBody></Table> : <EmptyState title="No API keys">Create a key to read machines, jobs and upkeep from another tool.</EmptyState>}
        </Card>
        <Card as="section" aria-label="Webhooks">
          <CardHeader title="Webhooks" description="Signed POST requests when things happen. Verify X-SpaceWorks-Signature (t=…,v1=HMAC-SHA256 of t.body) with the endpoint's secret."
            action={<ActionDialog action={createWebhookAction} fixed={fixed} arrays={["events"]} trigger="Add endpoint" triggerVariant="primary" title="Add a webhook endpoint" submitLabel="Add endpoint" success="Endpoint added"
              reveal={{ key: "secret", title: "Copy the signing secret now", note: "This is the only time the secret is shown. Use it to verify each delivery." }}><WebhookFields /></ActionDialog>} />
          {view.endpoints.length ? <ul className="flex flex-col divide-y divide-line">{view.endpoints.map((endpoint) => (
            <li key={endpoint.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1"><p className="truncate text-label" title={endpoint.url}>{endpoint.host}</p><p className="text-caption text-ink-muted">{endpoint.description || `${endpoint.events.length} events`}{endpoint.last ? ` · last delivery ${when(endpoint.last.at)} (${endpoint.last.status.toLowerCase()})` : ""}</p></div>
                <Chip size="sm" tone={endpoint.isActive ? "success" : "danger"}>{endpoint.isActive ? "On" : endpoint.disabledAt && endpoint.consecutiveFailures >= 10 ? "Switched off after failures" : "Off"}</Chip>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/integrations/webhooks/${endpoint.id}`}>Deliveries</Link></Button>
                <ActionDialog action={testWebhookAction} fixed={{ ...fixed, endpointId: endpoint.id }} trigger="Send test" title="Send a test delivery" submitLabel="Send test" success="Test queued"><p className="text-body-ui">Send a webhook.test event to {endpoint.host}?</p></ActionDialog>
                <ActionDialog action={updateWebhookAction} fixed={{ ...fixed, endpointId: endpoint.id }} arrays={["events"]} booleans={["isActive"]} trigger="Edit" title="Edit endpoint" submitLabel="Save endpoint" success="Endpoint saved"><WebhookFields values={endpoint} /></ActionDialog>
                <ActionDialog action={rotateWebhookSecretAction} fixed={{ ...fixed, endpointId: endpoint.id }} trigger="New secret" title="Make a new signing secret" description="The old secret stops working at once." submitLabel="Make new secret" submitVariant="dangerSolid" success="Secret changed"
                  reveal={{ key: "secret", title: "Copy the new signing secret", note: "This is the only time the secret is shown." }}><p className="text-body-ui">Replace the signing secret for {endpoint.host}?</p></ActionDialog>
                <ActionDialog action={deleteWebhookAction} fixed={{ ...fixed, endpointId: endpoint.id }} trigger="Delete" triggerVariant="danger" title="Delete endpoint" description="Its delivery log goes with it." submitLabel="Delete endpoint" submitVariant="dangerSolid" success="Endpoint deleted"><p className="text-body-ui">Delete the endpoint for {endpoint.host}?</p></ActionDialog>
              </div>
            </li>))}</ul> : <EmptyState title="No webhook endpoints">Add one to tell another system about jobs, payments, machines and upkeep as they happen.</EmptyState>}
        </Card>
      </> : null}
    </div>
  );
}
