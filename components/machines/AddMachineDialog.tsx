"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMachineAction } from "@/app/actions/machines";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Field, Dropdown } from "@/components/ui/field";
import { MachineFormFields } from "./MachineFormFields";
import { readMachineForm } from "./formValues";
import { useMachineMutation } from "./useMachineMutation";
import type { MachineTypeOption } from "./types";

export function AddMachineDialog({ spaceSlug, currency, types, money = true }: { spaceSlug: string; currency: string; types: MachineTypeOption[]; money?: boolean }) {
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const type = types.find((type) => type.id === typeId) ?? types[0];
  const mutation = useMachineMutation();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={(open) => { if (!mutation.pending) setOpen(open); }}>
      <DialogTrigger asChild><Button>Add machine</Button></DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader title="Add machine" description="Choose its type and add its details. The type cannot change after creation." />
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => {
          event.preventDefault();
          if (!type) return;
          const values = readMachineForm(new FormData(event.currentTarget), type.specFields);
          mutation.run(() => createMachineAction({ spaceSlug, typeId: type.id, ...values }), "Machine added", (data) => {
            setOpen(false);
            if (data) router.push(`/dashboard/${spaceSlug}/machines/${data.slug}`);
          });
        }}>
          <DialogBody>
            <fieldset disabled={mutation.pending} className="flex flex-col gap-5">
              {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
              {type ? <>
                <Field label="Machine type" error={mutation.fieldErrors.typeId?.[0]}><Dropdown value={type.id} onChange={(event) => setTypeId(event.target.value)}>
                  {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </Dropdown></Field>
                <MachineFormFields type={type} currency={currency} errors={mutation.fieldErrors} money={money} />
              </> : <Callout>No active machine types are available. A machine manager needs to add or restore a type first.</Callout>}
            </fieldset>
          </DialogBody>
          <DialogFooter><Button variant="secondary" type="button" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={mutation.pending} disabled={!type}>Add machine</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
