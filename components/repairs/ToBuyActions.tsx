"use client";

import { useState } from "react";
import { advanceToBuyAction, requestToBuyAction } from "@/app/actions/to-buy";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { PAYOUT_METHOD_LABELS } from "@/components/repairs/labels";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { isCurrencyCode, parseAmount } from "@/lib/money/currencies";

/** Ask for a part (for a machine) or a consumable (for a pool, restocked when it arrives). */
export function ToBuyRequestDialog({ spaceSlug, machines, pools, faultId }: { spaceSlug: string; machines: { id: string; name: string }[];
  pools: { id: string; label: string; unit: string }[]; faultId?: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"PART" | "CONSUMABLE">("PART");
  const mutation = useMachineMutation();
  return <Dialog open={open} onOpenChange={(next) => { if (!mutation.pending) setOpen(next); }}>
    <DialogTrigger asChild><Button size={faultId ? "sm" : "md"} variant={faultId ? "secondary" : "primary"}>Ask to buy</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader title="Ask to buy" description="The machine manager approves and buys it." />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const text = (key: string) => String(data.get(key) ?? "");
        mutation.run(() => requestToBuyAction({ spaceSlug, kind, title: text("title"), quantity: text("quantity"), unit: text("unit"),
          machineId: kind === "PART" ? text("machineId") || null : null, poolId: kind === "CONSUMABLE" ? text("poolId") || null : null, faultId: faultId ?? null, note: text("note") }),
          "Added to the to-buy list", () => setOpen(false));
      }}>
        <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-4">
          {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
          <Field label="Kind"><Dropdown value={kind} onChange={(event) => setKind(event.target.value as "PART" | "CONSUMABLE")}>
            <option value="PART">A part</option><option value="CONSUMABLE">A consumable</option></Dropdown></Field>
          <Field label="What to buy" error={mutation.fieldErrors.title?.[0]}><Input name="title" required minLength={2} maxLength={160} /></Field>
          <Field label="Quantity" error={mutation.fieldErrors.quantity?.[0]} helperText={kind === "CONSUMABLE" ? "In the pool's unit." : undefined}><Input name="quantity" inputMode="decimal" required defaultValue="1" /></Field>
          {kind === "PART" ? <>
            <Field label="Unit" optional><Input name="unit" maxLength={30} placeholder="pieces" /></Field>
            {faultId ? null : <Field label="Machine" optional><Dropdown name="machineId" defaultValue=""><option value="">None</option>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}</Dropdown></Field>}
          </> : <Field label="Pool" helperText={pools.length ? "Receiving it restocks this pool." : "No consumable pools yet. Add one on the Consumables page first."}><Dropdown name="poolId" required disabled={!pools.length}>{pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.label} ({pool.unit})</option>)}</Dropdown></Field>}
          <Field label="Note" optional><Textarea name="note" rows={2} maxLength={1000} /></Field>
        </fieldset></DialogBody>
        <DialogFooter><Button type="button" variant="secondary" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.pending} disabled={kind === "CONSUMABLE" && !pools.length}>Add to list</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

/** The machine manager moves an item on; buying records what was actually spent. */
export function ToBuyStepButtons({ spaceSlug, itemId, status, currency, title }: { spaceSlug: string; itemId: string; status: string; currency: string; title: string }) {
  const mutation = useMachineMutation();
  const [open, setOpen] = useState(false);
  const [amountError, setAmountError] = useState("");
  const step = (next: "APPROVED" | "CANCELLED" | "RECEIVED", message: string) => mutation.run(() => advanceToBuyAction({ spaceSlug, itemId, status: next }), message);
  return <div className="flex flex-wrap gap-2">
    {status === "REQUESTED" ? <Button size="sm" loading={mutation.pending} onClick={() => step("APPROVED", "Approved")}>Approve<span className="sr-only"> {title}</span></Button> : null}
    {status === "APPROVED" ? <Dialog open={open} onOpenChange={(next) => { if (!mutation.pending) setOpen(next); }}>
      <DialogTrigger asChild><Button size="sm">Mark bought<span className="sr-only"> {title}</span></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader title={`Bought: ${title}`} description="What you actually spent goes into Finance." />
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const text = (key: string) => String(data.get(key) ?? "");
          const amount = isCurrencyCode(currency) ? parseAmount(text("amount"), currency) : null;
          if (amount === null || amount <= 0) { setAmountError("Enter what was spent."); return; }
          setAmountError("");
          mutation.run(() => advanceToBuyAction({ spaceSlug, itemId, status: "BOUGHT", amount, method: text("method"), reference: text("reference"), supplier: text("supplier"),
            boughtOn: text("boughtOn") || undefined }), "Marked bought", () => setOpen(false));
        }}>
          <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-4">
            {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
            <Field label={`Amount spent (${currency})`} error={amountError || undefined}><Input name="amount" inputMode="decimal" required /></Field>
            <Field label="Method"><Dropdown name="method" defaultValue="UPI">{Object.entries(PAYOUT_METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Dropdown></Field>
            <Field label="Reference" optional helperText="Needed for everything except cash."><Input name="reference" maxLength={200} /></Field>
            <Field label="Supplier" helperText="Who you bought it from."><Input name="supplier" required minLength={2} maxLength={200} /></Field>
            <Field label="Bought on" optional><Input name="boughtOn" type="date" /></Field>
          </fieldset></DialogBody>
          <DialogFooter><Button type="button" variant="secondary" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.pending}>Mark bought</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog> : null}
    {status === "BOUGHT" ? <Button size="sm" loading={mutation.pending} onClick={() => step("RECEIVED", "Received")}>Mark received<span className="sr-only"> {title}</span></Button> : null}
    {status === "REQUESTED" || status === "APPROVED" ? <Button size="sm" variant="dangerQuiet" disabled={mutation.pending} onClick={() => step("CANCELLED", "Cancelled")}>Cancel item<span className="sr-only">: {title}</span></Button> : null}
  </div>;
}
