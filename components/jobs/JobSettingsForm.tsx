"use client";
import { saveJobSettingsAction } from "@/app/actions/job-settings";
import type { z } from "zod";
import type { jobSettingsSchema } from "@/lib/jobs/settingsSchemas";
import { Button } from "@/components/ui/button";
import { Field, Dropdown, Input } from "@/components/ui/field";
import { CheckboxField } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { words } from "@/lib/jobs/presentation";

export function JobSettingsForm({ spaceSlug, settings: s }: { spaceSlug: string; settings: z.infer<typeof jobSettingsSchema> }) {
  const mutation = useMachineMutation();
  return <form className="flex max-w-[760px] flex-col gap-5" onSubmit={(e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const values: Record<string, unknown> = { eligibility: form.get("eligibility"), maxOpenJobsPerRequester: Number(form.get("maxOpenJobsPerRequester")) };
    for (const key of ["jobsEnabled", "allowRequesterCancel"]) values[key] = form.get(key) === "on";
    for (const key of ["refundOnFailure", "refundOnCancel", "refundOnReject"]) { values[key] = form.get(key); values[`${key}Percent`] = Number(form.get(`${key}Percent`)); }
    for (const [key, events] of [["requesterEmails", ["submitted", "approved", "rejected", "started", "completed", "failed", "cancelled", "payment", "refund"]], ["staffAlerts", ["submitted", "cancelled", "failed", "payment"]]] as const) values[key] = Object.fromEntries(events.map((event) => [event, form.get(`${key}.${event}`) === "on"]));
    mutation.run(() => saveJobSettingsAction({ spaceSlug, values }), "Job settings saved");
  }}><fieldset disabled={mutation.pending} className="flex flex-col gap-5">
    {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
    <CheckboxField name="jobsEnabled" label="Accept job requests" defaultChecked={s.jobsEnabled} />
    <Field label="Who can request jobs"><Dropdown name="eligibility" defaultValue={s.eligibility}><option value="ANYONE">Any signed-in person</option><option value="MEMBERS_ONLY">Active members only</option><option value="STAFF_ONLY">Staff create on behalf only</option></Dropdown></Field>
    <Field label="Maximum open jobs per requester" helperText="Jobs not yet collected, rejected, failed or cancelled."><Input name="maxOpenJobsPerRequester" type="number" min="1" max="10000" required defaultValue={s.maxOpenJobsPerRequester} /></Field>
    <CheckboxField name="allowRequesterCancel" label="Allow requesters to cancel before starting" defaultChecked={s.allowRequesterCancel} />
    <h2 className="text-title">Refund rules</h2>
    {(["Failure", "Cancel", "Reject"] as const).map((outcome) => {
      const key = `refundOn${outcome}` as const;
      return <div key={key} className="grid gap-3 sm:grid-cols-2"><Field label={`On ${outcome.toLowerCase()}`}><Dropdown name={key} defaultValue={s[key]}>{["FULL", "PERCENT", "NONE", "MANUAL"].map((v) => <option key={v} value={v}>{words(v)}</option>)}</Dropdown></Field><Field label={`Refund percentage on ${outcome.toLowerCase()}`} helperText="Used only when the rule is Percent."><Input name={`${key}Percent`} type="number" min="0" max="100" required defaultValue={s[`${key}Percent`]} /></Field></div>;
    })}
    {(["requesterEmails", "staffAlerts"] as const).map((key) => <fieldset key={key} className="flex flex-col gap-3"><legend className="mb-3 text-title">{key === "requesterEmails" ? "Requester emails" : "Staff email and chat alerts"}</legend>
      {(key === "requesterEmails" ? ["submitted", "approved", "rejected", "started", "completed", "failed", "cancelled", "payment", "refund"] : ["submitted", "cancelled", "failed", "payment"]).map((event) => <CheckboxField key={event} name={`${key}.${event}`} label={words(event)} defaultChecked={(s[key] as Record<string, boolean>)[event] !== false} />)}
    </fieldset>)}
    <div><Button type="submit" variant="primary" loading={mutation.pending}>Save job settings</Button></div>
  </fieldset></form>;
}
