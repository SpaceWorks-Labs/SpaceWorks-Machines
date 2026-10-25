"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMachineTypeAction } from "@/app/actions/machine-types";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Dropdown } from "@/components/ui/field";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { MACHINE_TYPE_PRESETS } from "@/lib/machines/presets";

export function NewTypeDialog({ spaceSlug, types }: { spaceSlug: string; types: { id: string; name: string; archived: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const mutation = useMachineMutation();
  const router = useRouter();
  return <Dialog open={open} onOpenChange={(open) => { if (!mutation.pending) setOpen(open); }}>
    <DialogTrigger asChild><Button variant="primary">New type</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader title="New machine type" description="Start from scratch or copy a type. Changes to the copy do not affect its source." />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const source = String(data.get("source"));
        const from = source.startsWith("preset:") ? { kind: "preset", presetKey: source.slice(7) }
          : source.startsWith("type:") ? { kind: "type", typeId: source.slice(5) } : { kind: "blank" };
        mutation.run(() => createMachineTypeAction({ spaceSlug, name: data.get("name"), from }), "Machine type created", (result) => {
          setOpen(false);
          if (result) router.push(`/dashboard/${spaceSlug}/machine-settings/types/${result.slug}`);
        });
      }}>
        <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-5">
          {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
          <Field label="Name" error={mutation.fieldErrors.name?.[0]}><Input name="name" required minLength={2} maxLength={60} /></Field>
          <Field label="Starting point" error={Object.entries(mutation.fieldErrors).filter(([key]) => key.startsWith("from")).flatMap(([, errors]) => errors).join(" ")}>
            <Dropdown name="source" defaultValue="blank">
              <option value="blank">From scratch</option>
              {MACHINE_TYPE_PRESETS.map((preset) => <option key={preset.key} value={`preset:${preset.key}`}>Preset: {preset.name}</option>)}
              {types.map((type) => <option key={type.id} value={`type:${type.id}`}>Copy: {type.name}{type.archived ? " (archived)" : ""}</option>)}
            </Dropdown>
          </Field>
        </fieldset></DialogBody>
        <DialogFooter><Button variant="secondary" type="button" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.pending}>Create type</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
