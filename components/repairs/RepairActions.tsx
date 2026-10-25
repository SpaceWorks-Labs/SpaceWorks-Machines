"use client";

import { useMemo, useState, type ReactNode } from "react";
import { answerRepairRequestAction, approveRepairAmountAction, assignTechnicianAction, recordRepairPayoutAction, recordStaffFixAction,
  revokeRepairRequestAction, sendRepairRequestsAction, verifyRepairAction } from "@/app/actions/repairs";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { CHANNEL_LABELS, PAYOUT_METHOD_LABELS } from "@/components/repairs/labels";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { isCurrencyCode, parseAmount, toInputValue } from "@/lib/money/currencies";

type Mutation = ReturnType<typeof useMachineMutation>;
const toMinor = (raw: string, currency: string) => raw.trim() === "" ? null : isCurrencyCode(currency) ? parseAmount(raw.trim(), currency) : null;
const fromMinor = (minor: number | null, currency: string) => minor == null ? "" : isCurrencyCode(currency) ? toInputValue(minor, currency) : String(minor);

/** A dialog whose body is rendered by the caller, with the mutation's error ready to place. */
function FormDialog({ trigger, title, description, mutation, open, setOpen, children }: { trigger: ReactNode; title: string; description: string;
  mutation: Mutation; open: boolean; setOpen: (open: boolean) => void; children: (form: { error: ReactNode }) => ReactNode }) {
  return <Dialog open={open} onOpenChange={(next) => { if (!mutation.pending) setOpen(next); }}>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    <DialogContent>
      <DialogHeader title={title} description={description} />
      {children({ error: mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null })}
    </DialogContent>
  </Dialog>;
}

/** Pick technicians (filter by skill) and send them the request, or give the repair to one directly. */
export function AskTechniciansDialog({ spaceSlug, faultId, technicians }: { spaceSlug: string; faultId: string;
  technicians: { id: string; name: string; kind: string; skills: string[]; channels: string[] }[] }) {
  const [open, setOpen] = useState(false);
  const [skill, setSkill] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const mutation = useMachineMutation();
  const skills = useMemo(() => [...new Set(technicians.flatMap((row) => row.skills))].sort(), [technicians]);
  const shown = technicians.filter((row) => !skill || row.skills.includes(skill));
  const toggle = (id: string, on: boolean) => setPicked((current) => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next; });
  return <FormDialog trigger={<Button size="sm">Ask technicians</Button>} title="Ask technicians" description="Each one hears by email, plus WhatsApp or Telegram when set up. The first to accept takes the repair." mutation={mutation} open={open} setOpen={setOpen}>{({ error }) => <>
      <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-4">
        {error}
        {technicians.length === 0 ? <p className="text-ink-secondary">Add technicians on the Technicians page first.</p> : <>
          {skills.length ? <Field label="Skill"><Dropdown value={skill} onChange={(event) => setSkill(event.target.value)}><option value="">Any skill</option>
            {skills.map((value) => <option key={value} value={value}>{value}</option>)}</Dropdown></Field> : null}
          <div className="flex flex-col gap-3">{shown.map((row) => <CheckboxField key={row.id} label={row.name} checked={picked.has(row.id)} onCheckedChange={(value) => toggle(row.id, value === true)}
            description={[row.kind === "STAFF" ? "Staff" : "Outside", row.skills.join(", "), row.channels.map((channel) => CHANNEL_LABELS[channel]).join(", ")].filter(Boolean).join(" · ")} />)}</div>
        </>}
      </fieldset></DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" disabled={mutation.pending || picked.size !== 1}
          onClick={() => mutation.run(() => assignTechnicianAction({ spaceSlug, faultId, technicianId: [...picked][0] }), "Technician assigned", () => setOpen(false))}>Assign directly</Button>
        <Button type="button" loading={mutation.pending} disabled={picked.size === 0}
          onClick={() => mutation.run(() => sendRepairRequestsAction({ spaceSlug, faultId, technicianIds: [...picked] }), "Requests sent", () => { setPicked(new Set()); setOpen(false); })}>Send request</Button>
      </DialogFooter></>}</FormDialog>;
}

export function AnswerRequestButtons({ spaceSlug, requestId }: { spaceSlug: string; requestId: string }) {
  const mutation = useMachineMutation();
  return <div className="flex gap-2">
    <Button size="sm" loading={mutation.pending} onClick={() => mutation.run(() => answerRepairRequestAction({ spaceSlug, requestId, accept: true }), "You took the repair")}>Accept the repair</Button>
    <Button size="sm" variant="secondary" disabled={mutation.pending} onClick={() => mutation.run(() => answerRepairRequestAction({ spaceSlug, requestId, accept: false }), "Request declined")}>Decline</Button>
  </div>;
}

export function RevokeRequestButton({ spaceSlug, requestId, name }: { spaceSlug: string; requestId: string; name: string }) {
  const mutation = useMachineMutation();
  return <Button size="sm" variant="dangerQuiet" loading={mutation.pending} onClick={() => mutation.run(() => revokeRepairRequestAction({ spaceSlug, requestId }), "Request withdrawn")}>
    Withdraw<span className="sr-only"> the request to {name}</span></Button>;
}

/** The staff technician who took the repair records it, as an outside one does from their link. */
export function StaffFixForm({ spaceSlug, faultId, currency, remarks, parts, amountAsked }: { spaceSlug: string; faultId: string; currency: string;
  remarks: string; parts: string; amountAsked: number | null }) {
  const mutation = useMachineMutation();
  const [amountError, setAmountError] = useState("");
  const submit = (form: HTMLFormElement, fixed: boolean) => {
    const data = new FormData(form);
    const raw = String(data.get("amountAsked") ?? "");
    const amount = toMinor(raw, currency);
    if (raw.trim() && amount === null) { setAmountError("Enter the amount as a number."); return; }
    setAmountError("");
    mutation.run(() => recordStaffFixAction({ spaceSlug, faultId, remarks: String(data.get("remarks") ?? ""), parts: String(data.get("parts") ?? ""), amountAsked: amount, fixed }),
      fixed ? "Marked fixed" : "Saved");
  };
  return <form aria-label="Record the fix" className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget, false); }}>
    <fieldset disabled={mutation.pending} className="flex flex-col gap-4">
      {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
      <Field label="What you fixed"><Textarea name="remarks" rows={3} maxLength={4000} defaultValue={remarks} /></Field>
      <Field label="Parts used" optional><Textarea name="parts" rows={2} maxLength={2000} defaultValue={parts} /></Field>
      <Field label={`Amount you ask (${currency})`} optional error={amountError || undefined}><Input name="amountAsked" inputMode="decimal" defaultValue={fromMinor(amountAsked, currency)} /></Field>
      <div className="flex flex-wrap gap-2"><Button type="submit" variant="secondary" loading={mutation.pending}>Save</Button>
        <Button type="button" disabled={mutation.pending} onClick={(event) => { const form = event.currentTarget.form; if (form) submit(form, true); }}>Mark fixed</Button></div>
    </fieldset>
  </form>;
}

/** Check a repair marked fixed: close it, or reopen it with a reason the technician sees. */
export function VerifyRepairButtons({ spaceSlug, faultId }: { spaceSlug: string; faultId: string }) {
  const [open, setOpen] = useState(false);
  const mutation = useMachineMutation();
  return <div className="flex flex-wrap items-center gap-2">
    <p className="font-bold">The technician marked this fixed.</p>
    <Button size="sm" loading={mutation.pending} onClick={() => mutation.run(() => verifyRepairAction({ spaceSlug, faultId, approve: true }), "Repair checked and closed")}>Check and close</Button>
    <FormDialog trigger={<Button size="sm" variant="secondary">Reopen</Button>} title="Reopen the repair" description="Tell the technician what still needs doing." mutation={mutation} open={open} setOpen={setOpen}>{({ error }) =>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault();
        const reason = String(new FormData(event.currentTarget).get("reason") ?? "");
        mutation.run(() => verifyRepairAction({ spaceSlug, faultId, approve: false, reason }), "Repair reopened", () => setOpen(false)); }}>
        <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-4">{error}
          <Field label="Reason"><Textarea name="reason" rows={3} required minLength={3} maxLength={1000} /></Field></fieldset></DialogBody>
        <DialogFooter><Button type="submit" loading={mutation.pending}>Reopen repair</Button></DialogFooter>
      </form>}</FormDialog>
  </div>;
}

export function ApproveAmountDialog({ spaceSlug, faultId, currency, asked }: { spaceSlug: string; faultId: string; currency: string; asked: number | null }) {
  const [open, setOpen] = useState(false);
  const [amountError, setAmountError] = useState("");
  const mutation = useMachineMutation();
  return <FormDialog trigger={<Button size="sm" variant="secondary">Approve amount</Button>} title="Approve the amount" description="What the technician will be paid. A different amount from what they asked needs a reason." mutation={mutation} open={open} setOpen={setOpen}>{({ error }) =>
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault();
      const data = new FormData(event.currentTarget);
      const amount = toMinor(String(data.get("amount") ?? ""), currency);
      if (amount === null) { setAmountError("Enter an amount."); return; }
      setAmountError("");
      mutation.run(() => approveRepairAmountAction({ spaceSlug, faultId, amount, reason: String(data.get("reason") ?? "") }), "Amount approved", () => setOpen(false)); }}>
      <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-4">{error}
        <Field label={`Amount (${currency})`} error={amountError || undefined}><Input name="amount" inputMode="decimal" required defaultValue={fromMinor(asked, currency)} /></Field>
        <Field label="Reason for a different amount" optional><Textarea name="reason" rows={2} maxLength={500} /></Field></fieldset></DialogBody>
      <DialogFooter><Button type="submit" loading={mutation.pending}>Approve amount</Button></DialogFooter>
    </form>}</FormDialog>;
}

export function PayoutDialog({ spaceSlug, faultId, currency, due }: { spaceSlug: string; faultId: string; currency: string; due: number }) {
  const [open, setOpen] = useState(false);
  const [amountError, setAmountError] = useState("");
  const mutation = useMachineMutation();
  return <FormDialog trigger={<Button size="sm">Record a payout</Button>} title="Record a payout" description={`Still due: ${fromMinor(due, currency)} ${currency}. Pay in parts if you need to.`} mutation={mutation} open={open} setOpen={setOpen}>{({ error }) =>
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault();
      const data = new FormData(event.currentTarget);
      const text = (key: string) => String(data.get(key) ?? "");
      const amount = toMinor(text("amount"), currency);
      if (amount === null || amount <= 0) { setAmountError("Enter an amount above zero."); return; }
      setAmountError("");
      mutation.run(() => recordRepairPayoutAction({ spaceSlug, faultId, amount, method: text("method"), reference: text("reference"), paidOn: text("paidOn") || undefined, note: text("note") }),
        "Payout recorded", () => setOpen(false)); }}>
      <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-4">{error}
        <Field label={`Amount (${currency})`} error={amountError || undefined}><Input name="amount" inputMode="decimal" required defaultValue={fromMinor(due, currency)} /></Field>
        <Field label="Method"><Dropdown name="method" defaultValue="UPI">{Object.entries(PAYOUT_METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Dropdown></Field>
        <Field label="Reference" optional helperText="Needed for everything except cash."><Input name="reference" maxLength={200} /></Field>
        <Field label="Paid on" optional><Input name="paidOn" type="date" /></Field>
        <Field label="Note" optional><Input name="note" maxLength={500} /></Field></fieldset></DialogBody>
      <DialogFooter><Button type="submit" loading={mutation.pending}>Record payout</Button></DialogFooter>
    </form>}</FormDialog>;
}
