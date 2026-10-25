"use client";

import { useState } from "react";
import { addFinanceEntryAction } from "@/app/actions/finance";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { CATEGORY_LABELS, METHOD_LABELS } from "@/lib/finance/summary";
import { isCurrencyCode, parseAmount } from "@/lib/money/currencies";

const CATEGORIES = ["OTHER_EXPENSE", "OTHER_INCOME", "PARTS", "CONSUMABLES", "MAINTENANCE"] as const;
const METHODS = ["CASH", "BANK_TRANSFER", "UPI", "OTHER"] as const;

/** Other money in or out (rent, utilities, a grant), entered by the machine manager and audited. */
export function ManualEntryDialog({ spaceSlug, currency, machines }: { spaceSlug: string; currency: string; machines: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [amountError, setAmountError] = useState("");
  const mutation = useMachineMutation();
  return <Dialog open={open} onOpenChange={(next) => { if (!mutation.pending) setOpen(next); }}>
    <DialogTrigger asChild><Button>Add an entry</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader title="Add an entry" description="Money in or out that doesn't come from a job, repair or purchase here." />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const amount = isCurrencyCode(currency) ? parseAmount(String(data.get("amount") ?? ""), currency) : null;
        if (amount === null || amount <= 0) { setAmountError("Enter an amount above zero."); return; }
        setAmountError("");
        const text = (key: string) => String(data.get(key) ?? "");
        mutation.run(() => addFinanceEntryAction({ spaceSlug, category: text("category"), amount, method: text("method"), reference: text("reference"),
          note: text("note"), occurredOn: text("occurredOn") || undefined, supplier: text("supplier"), machineId: text("machineId") || null }), "Entry added", () => setOpen(false));
      }}>
        <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-4">
          {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
          <Field label="Category"><Dropdown name="category" defaultValue="OTHER_EXPENSE">{CATEGORIES.map((value) => <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>)}</Dropdown></Field>
          <Field label={`Amount (${currency})`} error={amountError || undefined}><Input name="amount" inputMode="decimal" required /></Field>
          <Field label="Method"><Dropdown name="method" defaultValue="BANK_TRANSFER">{METHODS.map((value) => <option key={value} value={value}>{METHOD_LABELS[value]}</option>)}</Dropdown></Field>
          <Field label="Reference" optional><Input name="reference" maxLength={200} /></Field>
          <Field label="What it was for" error={mutation.fieldErrors.note?.[0]}><Textarea name="note" rows={2} required minLength={2} maxLength={500} /></Field>
          <Field label="Date" optional><Input name="occurredOn" type="date" /></Field>
          <Field label="Supplier or payer" optional><Input name="supplier" maxLength={200} /></Field>
          <Field label="Machine" optional><Dropdown name="machineId" defaultValue=""><option value="">None</option>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}</Dropdown></Field>
        </fieldset></DialogBody>
        <DialogFooter><Button type="button" variant="secondary" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={mutation.pending}>Add entry</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
