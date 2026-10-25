"use client";

import { useState } from "react";
import type { MachineStatus } from "@prisma/client";
import { changeMachineStatusAction } from "@/app/actions/machines";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Dropdown, Field, Textarea } from "@/components/ui/field";
import { MANUAL_MACHINE_STATUSES } from "@/lib/machines/schemas";
import { MACHINE_STATUS_LABELS } from "./MachineStatusChip";
import { useMachineMutation } from "./useMachineMutation";

export function MachineStatusDialog({ spaceSlug, machineId, status, note }: {
  spaceSlug: string; machineId: string; status: MachineStatus; note: string;
}) {
  const [open, setOpen] = useState(false);
  const mutation = useMachineMutation();
  return (
    <Dialog open={open} onOpenChange={(open) => { if (!mutation.pending) setOpen(open); }}>
      <DialogTrigger asChild><Button size="sm" variant="secondary">Change status</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader title="Change machine status" description="Running and paused follow jobs and printer connections. Staff can set the statuses below." />
        <form className="flex min-h-0 flex-col" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          mutation.run(() => changeMachineStatusAction({ spaceSlug, machineId, status: form.get("status"), note: form.get("note") }), "Status changed", () => setOpen(false));
        }}>
          <DialogBody>
            <fieldset disabled={mutation.pending} className="flex flex-col gap-4">
              {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
              <Field label="Status" error={mutation.fieldErrors.status?.[0]}><Dropdown name="status" defaultValue={MANUAL_MACHINE_STATUSES.find((value) => value === status) ?? "IDLE"}>
                {MANUAL_MACHINE_STATUSES.map((status) => <option key={status} value={status}>{MACHINE_STATUS_LABELS[status]}</option>)}
              </Dropdown></Field>
              <Field label="Status note" optional error={mutation.fieldErrors.note?.[0]}><Textarea name="note" defaultValue={note} maxLength={280} /></Field>
            </fieldset>
          </DialogBody>
          <DialogFooter><Button variant="secondary" type="button" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.pending}>Change status</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
