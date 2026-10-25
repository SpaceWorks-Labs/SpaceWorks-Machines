"use client";

import { setLowStockAlerts } from "@/app/actions/space-job-settings";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { useMachineMutation } from "@/components/machines/useMachineMutation";

export function LowStockAlerts({ spaceSlug, enabled, canConfigure }: { spaceSlug: string; enabled: boolean; canConfigure: boolean }) {
  const mutation = useMachineMutation();
  // A space-wide setting below the pools, so it starts folded; the header says whether it is on.
  return <CollapsibleSection id="consumables-low-stock" title="Low-stock alerts" startOpen={false}
    description={`${enabled ? "On" : "Off"}. One setting for every pool: staff who manage consumables are told when stock drops to its threshold.`}>
    {canConfigure ? <form key={String(enabled)} className="flex flex-col gap-4" onSubmit={(event) => {
      event.preventDefault();
      const lowStockAlerts = new FormData(event.currentTarget).has("lowStockAlerts");
      mutation.run(() => setLowStockAlerts({ spaceSlug, lowStockAlerts }), "Low-stock alerts saved");
    }}>
      {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
      <fieldset disabled={mutation.pending}><CheckboxField name="lowStockAlerts" defaultChecked={enabled} label="Send low-stock email and chat alerts" />
        {mutation.fieldErrors.lowStockAlerts?.[0] ? <p role="alert" className="text-caption text-danger-fg">{mutation.fieldErrors.lowStockAlerts[0]}</p> : null}</fieldset>
      <div><Button type="submit" variant="primary" loading={mutation.pending}>Save alert setting</Button></div>
    </form> : <p className="text-body-ui text-ink-secondary">Low-stock alerts are {enabled ? "on" : "off"}. A machine manager can change this setting.</p>}
  </CollapsibleSection>;
}
