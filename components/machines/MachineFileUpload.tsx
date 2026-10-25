"use client";

import type { ActionResult } from "@/app/actions/space";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { DocumentMetaFields } from "./DocumentMetaFields";
import { useMachineMutation } from "./useMachineMutation";

export function MachineFileUpload({ spaceSlug, machineId, kind, disabled = false }: {
  spaceSlug: string; machineId: string; kind: "photo" | "document"; disabled?: boolean;
}) {
  const mutation = useMachineMutation();
  const photo = kind === "photo";
  return (
    <form className="flex flex-col gap-4 border-t border-line pt-5" onSubmit={(event) => {
      event.preventDefault();
      const element = event.currentTarget;
      const form = new FormData(element);
      form.set("kind", kind);
      mutation.run(async (): Promise<ActionResult> => {
        const response = await fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/machines/${encodeURIComponent(machineId)}/files`, { method: "POST", body: form });
        const result = await response.json() as ActionResult;
        return !response.ok && result.ok ? { ok: false, error: "Couldn't upload the file. Try again." } : result;
      }, photo ? "Photo uploaded" : "Document uploaded", () => element.reset());
    }}>
      {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
      {disabled ? <p className="text-body-ui text-ink-muted">All 8 photo slots are in use. Remove a photo before uploading another.</p> : null}
      <fieldset disabled={disabled || mutation.pending} className="flex flex-col gap-4">
        <Field label={photo ? "Photo file" : "Document file"} helperText={photo ? "JPEG, PNG or WebP, up to 10 MB. Up to 8 photos per machine; the first is the cover." : "PDF, PNG, JPEG, WebP or text, up to 20 MB."} error={mutation.fieldErrors.file?.[0]}>
          <Input name="file" type="file" required accept={photo ? "image/jpeg,image/png,image/webp" : ".pdf,.png,.jpg,.jpeg,.webp,.txt"} />
        </Field>
        {photo ? <Field label="Alt text" optional helperText="Describe the machine for someone who cannot see the photo." error={mutation.fieldErrors.alt?.[0]}><Input name="alt" maxLength={200} /></Field>
          : <><DocumentMetaFields errors={mutation.fieldErrors} upload /><CheckboxField name="isPublic" value="true" label="Public document" description="Available publicly when this machine is publicly listed." /></>}
        <div><Button type="submit" loading={mutation.pending}>{photo ? "Upload photo" : "Upload document"}</Button></div>
      </fieldset>
    </form>
  );
}
