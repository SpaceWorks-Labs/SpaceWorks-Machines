"use client";

import { useState } from "react";
import { answerRepairLinkAction, recordRepairLinkFixAction } from "@/app/actions/repair-link";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { UpkeepFileUpload } from "@/components/upkeep/UpkeepFileUpload";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader, Chip } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";
import { isCurrencyCode, parseAmount } from "@/lib/money/currencies";
import { formatDate } from "@/lib/format/datetime";
import { PAYOUT_STATUS_LABELS } from "@/components/repairs/labels";
import type { loadRepairLinkView } from "@/lib/views/app__r__token__page";

type View = Awaited<ReturnType<typeof loadRepairLinkView>>;

/** What an external technician does from their link: answer, then record the fix and the amount they ask. */
export function RepairLinkPanel({ view }: { view: View }) {
  const mutation = useMachineMutation();
  const [amountError, setAmountError] = useState("");
  if (view.status === "SENT") {
    return <Card className="flex flex-col gap-4">
      <CardHeader title="Can you take this repair?" description={`This request expires on ${formatDate(view.expiresAt, "UTC")}. The first technician to accept gets the job.`} />
      {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="primary" className="w-full sm:w-auto" loading={mutation.pending} onClick={() => mutation.run(() => answerRepairLinkAction({ token: view.token, accept: true }), "You took the repair")}>Accept the repair</Button>
        <Button variant="secondary" className="w-full sm:w-auto" disabled={mutation.pending} onClick={() => mutation.run(() => answerRepairLinkAction({ token: view.token, accept: false }), "Request declined")}>Decline</Button>
      </div>
    </Card>;
  }
  const fixed = view.fault.status === "FIXED";
  const submit = (form: HTMLFormElement, markFixed: boolean) => {
    const data = new FormData(form);
    const raw = String(data.get("amountAsked") ?? "").trim();
    const amountAsked = raw === "" ? null : isCurrencyCode(view.currency) ? parseAmount(raw, view.currency) : Number.parseInt(raw, 10);
    if (raw !== "" && (amountAsked === null || Number.isNaN(amountAsked))) { setAmountError("Enter the amount as a number."); return; }
    setAmountError("");
    mutation.run(() => recordRepairLinkFixAction({ token: view.token, remarks: String(data.get("remarks") ?? ""), parts: String(data.get("parts") ?? ""),
      amountAsked, fixed: markFixed }), markFixed ? "Marked fixed. The space will check it." : "Saved");
  };
  return <div className="flex flex-col gap-5">
    {view.fault.reopenReason ? <Callout tone="warning" title="The space reopened this repair">{view.fault.reopenReason}</Callout> : null}
    {fixed ? <Callout tone="success" title="Marked fixed">The space will check the repair and close it.</Callout> : null}
    <Card className="flex flex-col gap-4">
      <CardHeader title="Your fix" description="What you did, the parts you used and the amount you ask, in the space's currency." />
      {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget, false); }}>
        <fieldset disabled={mutation.pending || fixed} className="flex flex-col gap-4">
          <Field label="What you fixed"><Textarea name="remarks" rows={4} maxLength={4000} defaultValue={view.fix.remarks} /></Field>
          <Field label="Parts used" optional><Textarea name="parts" rows={2} maxLength={2000} defaultValue={view.fix.parts} /></Field>
          <Field label={`Amount you ask (${view.currency})`} optional error={amountError || undefined}
            helperText={view.fix.approved ? "Approved by the space; it can't change now." : undefined}>
            <Input name="amountAsked" inputMode="decimal" defaultValue={view.fix.amountAsked} readOnly={view.fix.approved} />
          </Field>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button type="submit" variant="secondary" className="w-full sm:w-auto" loading={mutation.pending}>Save</Button>
            <Button type="button" variant="primary" className="w-full sm:w-auto" disabled={mutation.pending} onClick={(event) => { const form = event.currentTarget.form; if (form) submit(form, true); }}>Mark fixed</Button>
          </div>
        </fieldset>
      </form>
      {!fixed ? <UpkeepFileUpload spaceSlug="" kind="fault" targetId="" label={`Add a photo of the fix (${view.fix.fixPhotos} so far)`}
        endpoint={`/api/repair-link/${view.token}/photos`} /> : null}
    </Card>
    {view.fix.approved || view.fix.payoutStatus !== "UNPAID" ? <p className="flex flex-wrap items-center gap-2 text-body-ui">Payment <Chip size="sm">{PAYOUT_STATUS_LABELS[view.fix.payoutStatus]}</Chip></p> : null}
  </div>;
}
