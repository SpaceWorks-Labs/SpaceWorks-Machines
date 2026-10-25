"use client";

import { CheckboxField } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import { API_SCOPES, API_SCOPE_LABELS } from "@/lib/apiScopes";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";

/** Field groups for the integration dialogs; names match app/actions/integrations.ts. */

export function ApiKeyFields() {
  return <>
    <Field label="Name" helperText="What uses this key, for example the front desk display."><Input name="name" required maxLength={80} /></Field>
    <fieldset className="flex flex-col gap-3"><legend className="mb-2 text-label">Scopes</legend>
      {API_SCOPES.map((scope) => <CheckboxField key={scope} name="scopes" value={scope} label={scope} description={API_SCOPE_LABELS[scope]} />)}</fieldset>
    <Field label="Expires" optional helperText="Leave blank for a key that lasts until you revoke it."><Input name="expiresOn" type="date" /></Field>
  </>;
}

export function WebhookFields({ values }: { values?: { url: string; description: string; events: string[]; isActive: boolean } }) {
  return <>
    <Field label="Endpoint address" helperText="An https:// address on the public internet."><Input name="url" type="url" required maxLength={2000} defaultValue={values?.url} /></Field>
    <Field label="Description" optional><Input name="description" maxLength={200} defaultValue={values?.description} /></Field>
    <fieldset className="flex flex-col gap-2"><legend className="mb-2 text-label">Events</legend>
      <div className="grid gap-2 sm:grid-cols-2">{WEBHOOK_EVENTS.map((event) => <CheckboxField key={event} name="events" value={event} label={event} defaultChecked={values?.events.includes(event)} />)}</div></fieldset>
    {values ? <CheckboxField name="isActive" defaultChecked={values.isActive} label="Switched on" description="Switching it back on clears the failure count." /> : null}
  </>;
}
