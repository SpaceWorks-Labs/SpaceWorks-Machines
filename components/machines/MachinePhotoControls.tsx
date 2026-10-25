"use client";

import { useState } from "react";
import { updateMachinePhotoAction, reorderMachinePhotosAction, removeMachinePhotoAction } from "@/app/actions/machine-files";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Callout } from "@/components/ui/display";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { useMachineMutation } from "./useMachineMutation";
import type { MachinePhotoRow } from "./types";

export function MachinePhotoControls({ spaceSlug, machineId, photo, photoIds, index }: {
  spaceSlug: string; machineId: string; photo: MachinePhotoRow; photoIds: string[]; index: number;
}) {
  const mutation = useMachineMutation();
  const [confirm, setConfirm] = useState(false);
  function move(offset: number) {
    const ids = [...photoIds];
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    mutation.run(() => reorderMachinePhotosAction({ spaceSlug, machineId, photoIds: ids }), "Photo order updated");
  }
  return (
    <div className="flex flex-col gap-3">
      {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
      <form className="flex flex-col gap-2" onSubmit={(event) => {
        event.preventDefault();
        const alt = String(new FormData(event.currentTarget).get("alt") ?? "");
        mutation.run(() => updateMachinePhotoAction({ spaceSlug, photoId: photo.id, alt }), "Alt text saved");
      }}>
        <Field label={`Alt text for photo ${index + 1}`} error={mutation.fieldErrors.alt?.[0]}><Input name="alt" maxLength={200} defaultValue={photo.alt} disabled={mutation.pending} /></Field>
        <div><Button type="submit" size="sm" variant="secondary" loading={mutation.pending}>Save alt text</Button></div>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={mutation.pending || index === 0} aria-label={`Move photo ${index + 1} earlier`} onClick={() => move(-1)}>Move earlier</Button>
        <Button size="sm" variant="secondary" disabled={mutation.pending || index === photoIds.length - 1} aria-label={`Move photo ${index + 1} later`} onClick={() => move(1)}>Move later</Button>
        <Button size="sm" variant="dangerQuiet" disabled={mutation.pending} onClick={() => setConfirm(true)}>Remove photo</Button>
      </div>
      <ConfirmationDialog open={confirm} title={`Remove photo ${index + 1}?`} message="This photo will be deleted. You can upload a replacement later." confirmLabel="Remove photo" loading={mutation.pending}
        onCancel={() => setConfirm(false)} onConfirm={() => mutation.run(() => removeMachinePhotoAction({ spaceSlug, photoId: photo.id }), "Photo removed", () => setConfirm(false))} />
    </div>
  );
}
