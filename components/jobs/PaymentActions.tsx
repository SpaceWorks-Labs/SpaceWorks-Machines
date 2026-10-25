"use client";

import { useState } from "react";
import { jobPaymentAction, payNowAction } from "@/app/actions/job-payments";
import type { JobDetail } from "@/lib/jobs/viewQueries";
import { isCurrencyCode, parseAmount } from "@/lib/money/currencies";
import { money, words } from "@/lib/jobs/presentation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, Textarea, Dropdown } from "@/components/ui/field";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { useMachineMutation } from "@/components/machines/useMachineMutation";

export type PaymentRow = JobDetail["payments"][number];
type Kind = "record" | "confirm" | "waive" | "refund" | "processRefund";
export function PaymentDialog({ spaceSlug, payment, kind, label, methods, refundId, refundAmount }: {
  spaceSlug: string; payment: PaymentRow; kind: Kind; label: string; methods: string[]; refundId?: string; refundAmount?: number;
}) {
  const [open, setOpen] = useState(false);
  const mutation = useMachineMutation();
  return <Dialog open={open} onOpenChange={(v) => { if (!mutation.pending) setOpen(v); }}>
    <DialogTrigger asChild><Button variant="secondary" size="sm">{label}</Button></DialogTrigger>
    <DialogContent><DialogHeader title={label} description={`${kind === "processRefund" ? "Refund" : words(payment.kind)} · ${money(refundAmount ?? payment.amount, payment.currency)}`} />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const text = (key: string) => String(form.get(key) ?? "");
        const amount = text("amount") && isCurrencyCode(payment.currency) ? parseAmount(text("amount"), payment.currency) ?? -1 : undefined;
        mutation.run(() => jobPaymentAction({ spaceSlug, paymentId: payment.id, command: { kind, method: text("method"), reference: text("reference") || undefined, note: text("note"), reason: text("reason"), amount, refundId } }), "Payment updated", () => setOpen(false));
      }}><DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-5">
        {mutation.error ? <Callout role="alert" tone="danger">{mutation.error}</Callout> : null}
        {kind === "record" && !methods.length ? <Callout tone="warning">No offline payment methods are turned on. Choose them in the job payment settings first.</Callout> : null}
        {kind === "record" ? <><Field label="Payment method"><Dropdown name="method" required>{methods.map((m) => <option key={m} value={m}>{words(m)}</option>)}</Dropdown></Field>
          <Field label="Reference" helperText="A receipt number, UPI reference (UTR) or bank reference."><Input name="reference" required maxLength={2000} /></Field><Field label="Payment note" optional><Textarea name="note" maxLength={2000} /></Field></> : null}
        {kind === "refund" ? <Field label={`Refund amount (${payment.currency})`} helperText="Leave blank to propose the full available amount." optional><Input name="amount" inputMode="decimal" /></Field> : null}
        {kind === "waive" || kind === "refund" ? <Field label="Reason"><Textarea name="reason" maxLength={2000} required /></Field> : null}
        {kind === "processRefund" ? ["RAZORPAY", "STRIPE"].includes(payment.method ?? "") ? <Callout>Return this amount through the original payment gateway.</Callout> : <Field label="Refund reference" helperText="Return the money first and enter its receipt or reference."><Input name="reference" required maxLength={2000} /></Field> : null}
        {kind === "confirm" ? <Callout>Confirm that the space received this payment. The person who recorded it cannot confirm it.</Callout> : null}
      </fieldset></DialogBody><DialogFooter><Button type="button" variant="secondary" disabled={mutation.pending} onClick={() => setOpen(false)}>Close</Button><Button type="submit" variant="primary" loading={mutation.pending} disabled={kind === "record" && !methods.length}>{label}</Button></DialogFooter></form>
    </DialogContent>
  </Dialog>;
}

export function PayNow({ spaceSlug, paymentId }: { spaceSlug: string; paymentId: string }) {
  const mutation = useMachineMutation();
  return <div className="flex flex-col gap-2">{mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
    <Button loading={mutation.pending} onClick={() => mutation.run(() => payNowAction({ spaceSlug, paymentId }), "Checkout ready", (data) => { if (data) window.location.assign(data.url); })}>Pay now</Button>
  </div>;
}
