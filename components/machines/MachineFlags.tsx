"use client";

import { setMachineFlagsAction } from "@/app/actions/machines";
import { SwitchRow } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { useMachineMutation } from "./useMachineMutation";

export function MachineFlags({ spaceSlug, machineId, isPublic, acceptsJobs, retired }: {
  spaceSlug: string; machineId: string; isPublic: boolean; acceptsJobs: boolean; retired: boolean;
}) {
  const mutation = useMachineMutation();
  return (
    <div className="flex flex-col gap-5">
      {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
      <SwitchRow label="Public listing" description="Show this machine on the space's public catalogue." checked={isPublic} disabled={mutation.pending || retired}
        onCheckedChange={(isPublic) => mutation.run(() => setMachineFlagsAction({ spaceSlug, machineId, isPublic }), "Public listing updated")} />
      <SwitchRow label="Accepts jobs" description="Allow job requests when the space and machine type also accept them." checked={acceptsJobs} disabled={mutation.pending || retired}
        onCheckedChange={(acceptsJobs) => mutation.run(() => setMachineFlagsAction({ spaceSlug, machineId, acceptsJobs }), "Job intake updated")} />
      {retired ? <p className="text-body-ui text-ink-muted">Bring this machine back into service before enabling either switch.</p> : null}
    </div>
  );
}
