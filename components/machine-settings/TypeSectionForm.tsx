"use client";

import { updateMachineTypeSection } from "@/app/actions/machine-types";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import type { FullType } from "@/lib/machines/queries";
import { readTypeSection, type SimpleSection } from "./formValues";
import { TypeSectionFields } from "./TypeSectionFields";

export function TypeSectionForm({ spaceSlug, type, section, canManage }: { spaceSlug: string; type: FullType; section: SimpleSection; canManage: boolean }) {
  const mutation = useMachineMutation();
  return <form className="flex max-w-3xl flex-col gap-5" onSubmit={(event) => {
    event.preventDefault();
    const values = readTypeSection(section, new FormData(event.currentTarget));
    mutation.run(() => updateMachineTypeSection({ spaceSlug, typeId: type.id, section, values }), "Type settings saved");
  }}>
    {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
    <fieldset disabled={!canManage || mutation.pending} className="flex flex-col gap-5">
      <TypeSectionFields section={section} type={type} errors={mutation.fieldErrors} />
    </fieldset>
    {canManage ? <div><Button type="submit" variant="primary" loading={mutation.pending}>Save section</Button></div> : <p className="text-caption text-ink-muted">A machine manager can change these settings.</p>}
  </form>;
}
