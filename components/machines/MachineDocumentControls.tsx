"use client";

import { useState } from "react";
import { updateMachineDocumentAction, removeMachineDocumentAction } from "@/app/actions/machine-files";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { DocumentMetaFields } from "./DocumentMetaFields";
import { useMachineMutation } from "./useMachineMutation";
import type { MachineDocumentRow } from "./types";

export function MachineDocumentControls({ spaceSlug, document }: { spaceSlug: string; document: MachineDocumentRow }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const mutation = useMachineMutation();
  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={open} onOpenChange={(open) => { if (!mutation.pending) setOpen(open); }}>
        <DialogTrigger asChild><Button size="sm" variant="secondary" disabled={mutation.pending}>Edit document</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader title="Edit document" description={document.filename} />
          <form className="flex min-h-0 flex-col" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            mutation.run(() => updateMachineDocumentAction({ spaceSlug, documentId: document.id, title: form.get("title"), kind: form.get("kind"), isPublic: form.get("isPublic") === "true" }), "Document saved", () => setOpen(false));
          }}>
            <DialogBody>
              <fieldset disabled={mutation.pending} className="flex flex-col gap-4">
                {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
                <DocumentMetaFields values={document} errors={mutation.fieldErrors} />
                <CheckboxField name="isPublic" value="true" label="Public document" description="Available publicly when this machine is publicly listed." defaultChecked={document.isPublic} />
              </fieldset>
            </DialogBody>
            <DialogFooter><Button variant="secondary" type="button" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.pending}>Save document</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Button size="sm" variant="dangerQuiet" disabled={mutation.pending} onClick={() => setConfirm(true)}>Remove document</Button>
      <ConfirmationDialog open={confirm} title={`Remove ${document.title}?`} message="This document will be deleted. You can upload a replacement later." confirmLabel="Remove document" loading={mutation.pending}
        onCancel={() => setConfirm(false)} onConfirm={() => mutation.run(() => removeMachineDocumentAction({ spaceSlug, documentId: document.id }), "Document removed", () => setConfirm(false))} />
    </div>
  );
}
