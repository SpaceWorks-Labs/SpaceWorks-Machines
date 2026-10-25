"use client";

import { useState } from "react";
import { reverseFinanceEntryAction } from "@/app/actions/finance";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";

/** Correct the ledger with an equal and opposite entry; the original stays, as entries never change. */
export function ReverseEntryButton({ spaceSlug, entryId }: { spaceSlug: string; entryId: string }) {
  const [open, setOpen] = useState(false);
  const mutation = useMachineMutation();
  return <Dialog open={open} onOpenChange={(next) => { if (!mutation.pending) setOpen(next); }}>
    <DialogTrigger asChild><Button size="sm" variant="secondary">Reverse</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader title="Reverse this entry" description="An opposite entry is posted with your reason. The original stays in the ledger." />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => {
        event.preventDefault();
        const reason = String(new FormData(event.currentTarget).get("reason") ?? "");
        mutation.run(() => reverseFinanceEntryAction({ spaceSlug, entryId, reason }), "Entry reversed", () => setOpen(false));
      }}>
        <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-4">
          {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
          <Field label="Reason" helperText="Kept with the reversing entry. At least 3 characters." error={mutation.fieldErrors.reason?.[0]}><Textarea name="reason" rows={3} required minLength={3} maxLength={500} /></Field>
        </fieldset></DialogBody>
        <DialogFooter><Button type="button" variant="secondary" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.pending}>Reverse entry</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
