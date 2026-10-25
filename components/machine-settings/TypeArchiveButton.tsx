"use client";

import { useState } from "react";
import { setMachineTypeArchivedAction } from "@/app/actions/machine-types";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { useMachineMutation } from "@/components/machines/useMachineMutation";

export function TypeArchiveButton({ spaceSlug, type }: { spaceSlug: string; type: { id: string; name: string; archived: boolean } }) {
  const [open, setOpen] = useState(false);
  const mutation = useMachineMutation();
  const label = type.archived ? "Unarchive type" : "Archive type";
  return <>
    <Button variant={type.archived ? "secondary" : "dangerQuiet"} size="sm" onClick={() => setOpen(true)}>{label}</Button>
    {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
    <ConfirmationDialog open={open} title={`${label}: ${type.name}?`} confirmLabel={label} destructive={!type.archived}
      message={type.archived ? "This type becomes available for machine creation and job requests again, subject to its queue rules."
        : "This type leaves machine creation and job requests. Its machines and their history are kept."}
      loading={mutation.pending} onCancel={() => setOpen(false)}
      onConfirm={() => mutation.run(() => setMachineTypeArchivedAction({ spaceSlug, typeId: type.id, archived: !type.archived }), type.archived ? "Type unarchived" : "Type archived", () => setOpen(false))} />
  </>;
}
