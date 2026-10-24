"use client";

import { setLowStockAlerts } from "@/app/actions/space-job-settings";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Card, CardHeader, Callout } from "@/components/ui/display";
import { useMachineMutation } from "@/components/machines/useMachineMutation";

export function LowStockAlerts({ spaceSlug, enabled, canConfigure }: { spaceSlug: string; enabled: boolean; canConfigure: boolean }) {
  const mutation = useMachineMutation();
  return <Card as="section" aria-label="Low-stock alerts">
    <CardHeader title="Low-stock alerts" description="One setting for every pool in this space. Alerts go to staff who manage consumables when a decrease leaves stock at or below its threshold." />
    {canConfigure ? <form key={String(enabled)} className="flex flex-col gap-4" onSubmit={(event) => {
      event.preventDefault();
      const lowStockAlerts = new FormData(event.currentTarget).has("lowStockAlerts");
      mutation.run(() => setLowStockAlerts({ spaceSlug, lowStockAlerts }), "Low-stock alerts saved");
    }}>
      {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
      <fieldset disabled={mutation.pending}><CheckboxField name="lowStockAlerts" defaultChecked={enabled} label="Send low-stock email and chat alerts" />
        {mutation.fieldErrors.lowStockAlerts?.[0] ? <p role="alert" className="text-caption text-danger-fg">{mutation.fieldErrors.lowStockAlerts[0]}</p> : null}</fieldset>
      <div><Button type="submit" loading={mutation.pending}>Save alert setting</Button></div>
    </form> : <p className="text-body-ui text-ink-secondary">Low-stock alerts are {enabled ? "on" : "off"}. A machine manager can change this setting.</p>}
  </Card>;
}
