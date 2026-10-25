"use client";

import { useState } from "react";
import { restockPoolAction, correctPoolAction, retirePoolAction } from "@/app/actions/consumables";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { formatQuantity } from "@/lib/consumables/math";
import { METERING_UNIT_LABELS } from "@/lib/machines/presets";
import type { PoolRow } from "@/lib/machines/queries";

const LABELS = { restock: "Restock", correction: "Correct stock", retire: "Retire pool" } as const;
/** `money`: the machine manager may record what a restock cost, which posts it to Finance. */
export function PoolLedgerDialog({ spaceSlug, pool, kind, money = false }: { spaceSlug: string; pool: PoolRow; kind: keyof typeof LABELS; money?: boolean }) {
  const [open, setOpen] = useState(false);
  const mutation = useMachineMutation();
  const label = LABELS[kind];
  return <Dialog open={open} onOpenChange={(open) => { if (!mutation.pending) setOpen(open); }}>
    <DialogTrigger asChild><Button size="sm" variant={kind === "retire" ? "dangerQuiet" : "secondary"}>{label}</Button></DialogTrigger>
    <DialogContent><DialogHeader title={`${label}: ${pool.material}`} description={`Current balance: ${formatQuantity(pool.remainingQuantity)} ${METERING_UNIT_LABELS[pool.unit].short}.`} />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const context = { spaceSlug, poolId: pool.id, reason: String(data.get("reason") ?? "") };
        const work = kind === "restock" ? () => restockPoolAction({ ...context, quantity: data.get("quantity"), lotCode: data.get("lotCode"),
          ...(money ? { amount: data.get("amount"), method: data.get("method") || "OTHER", reference: data.get("reference"), supplier: data.get("supplier") } : {}) })
          : kind === "correction" ? () => correctPoolAction({ ...context, delta: data.get("delta") })
          : () => retirePoolAction(context);
        mutation.run(work, kind === "retire" ? "Pool retired" : "Stock updated", () => setOpen(false));
      }}>
        <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-5">
          {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
          {kind === "retire" ? <Callout tone="warning">Retiring removes the remaining stock through a ledger entry and stops this pool serving machines. Its history is kept. This cannot be undone.</Callout> : <Field
            label={`${kind === "correction" ? "Quantity change" : "Quantity to add"} (${METERING_UNIT_LABELS[pool.unit].short})`}
            helperText={kind === "correction" ? "Use a minus sign to take stock out, for example -12.5. Up to three decimals. A balance cannot go below zero." : "A positive quantity, with up to three decimals."}
            error={mutation.fieldErrors[kind === "correction" ? "delta" : "quantity"]?.[0]}>
            <Input name={kind === "correction" ? "delta" : "quantity"} required inputMode={kind === "correction" ? "text" : "decimal"} />
          </Field>}
          {kind === "restock" ? <Field label="Lot" optional error={mutation.fieldErrors.lotCode?.[0]}><Input name="lotCode" maxLength={60} /></Field> : null}
          {kind === "restock" && money ? <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cost" optional helperText="If it was bought; posted to Finance."><Input name="amount" inputMode="decimal" maxLength={32} /></Field>
            <Field label="Paid by" optional><Dropdown name="method" defaultValue="UPI"><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="UPI">UPI</option><option value="OTHER">Other</option></Dropdown></Field>
            <Field label="Reference" optional><Input name="reference" maxLength={200} /></Field>
            <Field label="Supplier" optional><Input name="supplier" maxLength={200} /></Field>
          </div> : null}
          <Field label="Reason" optional={kind === "restock"} error={mutation.fieldErrors.reason?.[0]}>
            <Textarea name="reason" required={kind !== "restock"} minLength={kind !== "restock" ? 3 : undefined} maxLength={200} />
          </Field>
        </fieldset></DialogBody>
        <DialogFooter><Button type="button" variant="secondary" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant={kind === "retire" ? "dangerSolid" : "primary"} loading={mutation.pending}>{label}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
