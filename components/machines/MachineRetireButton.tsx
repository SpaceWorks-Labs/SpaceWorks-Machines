"use client";

import { useState } from "react";
import { setMachineRetiredAction } from "@/app/actions/machines";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { useMachineMutation } from "./useMachineMutation";

export function MachineRetireButton({ spaceSlug, machineId, name, retired }: { spaceSlug: string; machineId: string; name: string; retired: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const mutation = useMachineMutation();
  const label = retired ? "Bring back into service" : "Retire machine";
  return <>
    <Button size="sm" variant={retired ? "secondary" : "dangerQuiet"} onClick={() => setConfirm(true)}>{label}</Button>
    <ConfirmationDialog open={confirm} title={retired ? `Bring ${name} back into service?` : `Retire ${name}?`}
      message={retired ? "The machine returns to idle. Public listing and job intake stay switched off until you enable them." : "The machine goes offline and is removed from public pages and job queues. Its records and files are kept."}
      confirmLabel={label} destructive={!retired} loading={mutation.pending} onCancel={() => setConfirm(false)}
      onConfirm={() => mutation.run(() => setMachineRetiredAction({ spaceSlug, machineId, retired: !retired }), retired ? "Machine back in service" : "Machine retired", () => setConfirm(false))} />
  </>;
}
