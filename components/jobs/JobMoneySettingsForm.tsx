"use client";
import type { z } from "zod";
import type { moneySettingsSchema } from "@/lib/jobs/settingsSchemas";
import { saveJobMoneySettingsAction } from "@/app/actions/job-settings";
import { Field, Dropdown, Input } from "@/components/ui/field";
import { CheckboxField } from "@/components/ui/choice";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { words } from "@/lib/jobs/presentation";

export function JobMoneySettingsForm({ spaceSlug, initial: s, canEdit }: { spaceSlug: string; initial: z.infer<typeof moneySettingsSchema>; canEdit: boolean }) {
  const mutation = useMachineMutation();
  return <form onSubmit={(e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const values = { ...Object.fromEntries(["paymentsEnabled", "allowPayLater", "requirePaymentBeforeCollection", "publicUsesMemberRates", "taxInclusive"].map((key) => [key, f.get(key) === "on"])),
      defaultPaymentTiming: f.get("defaultPaymentTiming"), taxRateBps: Math.round(Number(f.get("taxPercent")) * 100), taxLabel: f.get("taxLabel"), onlineMethods: f.getAll("onlineMethods"), offlineMethods: f.getAll("offlineMethods") };
    mutation.run(() => saveJobMoneySettingsAction({ spaceSlug, values }), "Job payment policy saved");
  }}><fieldset disabled={!canEdit || mutation.pending} className="flex flex-col gap-5">
    {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
    <CheckboxField name="paymentsEnabled" label="Enable paid jobs" defaultChecked={s.paymentsEnabled} />
    <Field label="Default payment timing"><Dropdown name="defaultPaymentTiming" defaultValue={s.defaultPaymentTiming}><option value="UPFRONT">Before starting</option><option value="ON_COMPLETION">On completion</option><option value="PAY_LATER">Pay later</option></Dropdown></Field>
    <CheckboxField name="allowPayLater" label="Allow pay later" defaultChecked={s.allowPayLater} />
    <CheckboxField name="requirePaymentBeforeCollection" label="Require payment before collection" defaultChecked={s.requirePaymentBeforeCollection} />
    <CheckboxField name="publicUsesMemberRates" label="Use member prices when no public price is set" defaultChecked={s.publicUsesMemberRates} />
    <Field label="Tax percentage"><Input name="taxPercent" type="number" step="0.01" min="0" max="100" required defaultValue={s.taxRateBps / 100} /></Field>
    <Field label="Tax label"><Input name="taxLabel" maxLength={40} required defaultValue={s.taxLabel} /></Field>
    <CheckboxField name="taxInclusive" label="Prices include tax" defaultChecked={s.taxInclusive} />
    <fieldset className="flex flex-col gap-3"><legend className="mb-2 text-label">Online methods</legend>{["RAZORPAY", "STRIPE"].map((m) => <CheckboxField key={m} name="onlineMethods" value={m} label={words(m)} defaultChecked={s.onlineMethods.some((v) => v === m)} />)}</fieldset>
    <fieldset className="flex flex-col gap-3"><legend className="mb-2 text-label">Offline methods</legend>{["CASH", "UPI", "BANK_TRANSFER", "CARD_TERMINAL", "OTHER"].map((m) => <CheckboxField key={m} name="offlineMethods" value={m} label={words(m)} defaultChecked={s.offlineMethods.some((v) => v === m)} />)}</fieldset>
    {canEdit ? <div><Button type="submit" variant="primary" loading={mutation.pending}>Save job payment policy</Button></div> : <p className="text-caption text-ink-muted">Only a machine manager can change the job payment policy.</p>}
  </fieldset></form>;
}
