"use client";

import { useState } from "react";
import { setTypeAssignmentsAction } from "@/app/actions/team";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";

/** Machine managers pick the machine types a machine type manager looks after. */
export function TypeAssignmentsDialog({ spaceSlug, targetUserId, memberName, types, assigned }: {
  spaceSlug: string; targetUserId: string; memberName?: string; types: { id: string; name: string }[]; assigned: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set(assigned));
  const mutation = useMachineMutation();
  const toggle = (id: string, on: boolean) => setSelected((current) => {
    const next = new Set(current);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  return <Dialog open={open} onOpenChange={(next) => { if (mutation.pending) return; setOpen(next); if (next) setSelected(new Set(assigned)); }}>
    <DialogTrigger asChild><Button size="sm" variant="secondary">Machine types{memberName ? <span className="sr-only"> for {memberName}</span> : null}</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader title="Machine types" description={`${memberName ?? "This machine type manager"} gets full access and settings for the types you tick, and nothing else.`} />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => {
        event.preventDefault();
        mutation.run(() => setTypeAssignmentsAction({ spaceSlug, targetUserId, typeIds: [...selected] }), "Machine types saved", () => setOpen(false));
      }}>
        <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-3">
          {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
          {types.length ? types.map((type) => <CheckboxField key={type.id} label={type.name} checked={selected.has(type.id)}
            onCheckedChange={(value) => toggle(type.id, value === true)} />) : <p className="text-ink-muted">Add a machine type in Machine settings first.</p>}
        </fieldset></DialogBody>
        <DialogFooter><Button variant="secondary" type="button" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.pending}>Save machine types</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
