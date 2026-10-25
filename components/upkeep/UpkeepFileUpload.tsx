"use client";

import type { ActionResult } from "@/app/actions/space";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useMachineMutation } from "@/components/machines/useMachineMutation";

/**
 * Upload a maintenance attachment, warranty document or fault photo through the upkeep files route, or (with
 * `endpoint`) a photo of a fix through an outside technician's repair link.
 */
export function UpkeepFileUpload({ spaceSlug, kind, targetId, label, endpoint }: { spaceSlug: string; kind: "maintenance" | "warranty" | "fault"; targetId: string; label: string; endpoint?: string }) {
  const mutation = useMachineMutation();
  const photo = kind === "fault";
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      const element = event.currentTarget;
      const form = new FormData(element);
      form.set("kind", kind);
      form.set("targetId", targetId);
      mutation.run(async (): Promise<ActionResult> => {
        const response = await fetch(endpoint ?? `/api/spaces/${encodeURIComponent(spaceSlug)}/upkeep/files`, { method: "POST", body: form });
        const result = await response.json() as ActionResult;
        return !response.ok && result.ok ? { ok: false, error: "Couldn't upload the file. Try again." } : result;
      }, "File uploaded", () => element.reset());
    }}>
      <Field label={label} error={mutation.error || undefined} helperText={photo ? "JPEG, PNG or WebP, up to 10 MB." : "PDF, image or text, up to 20 MB."}>
        <Input name="file" type="file" required accept={photo ? "image/jpeg,image/png,image/webp" : ".pdf,.png,.jpg,.jpeg,.webp,.txt"} />
      </Field>
      <Button type="submit" size="sm" variant="secondary" loading={mutation.pending}>Upload</Button>
    </form>
  );
}
