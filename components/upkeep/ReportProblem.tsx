"use client";

import { useState } from "react";
import { reportFaultAction } from "@/app/actions/faults";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { FaultReportFields } from "./fields";
import { UpkeepFileUpload } from "./UpkeepFileUpload";

/** A maker reports a problem from the public machine page, then may add up to 4 photos to it. */
export function ReportProblem({ spaceSlug, machineId, machineName }: { spaceSlug: string; machineId: string; machineName: string }) {
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState<{ id: string; number: number } | null>(null);
  const mutation = useMachineMutation();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!mutation.pending) { setOpen(next); if (!next) setReported(null); } }}>
      <DialogTrigger asChild><Button variant="secondary">Report a problem</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader title={reported ? "Thanks for reporting it" : `Report a problem with ${machineName}`}
          description={reported ? `The team has fault F-${String(reported.number).padStart(4, "0")}. Add photos if they help.` : "The team sees this straight away."} />
        {reported ? <>
          <DialogBody><UpkeepFileUpload spaceSlug={spaceSlug} kind="fault" targetId={reported.id} label="Add a photo" /></DialogBody>
          <DialogFooter><Button type="button" variant="primary" onClick={() => { setOpen(false); setReported(null); }}>Done</Button></DialogFooter>
        </> : <form className="flex min-h-0 flex-col" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          mutation.run(() => reportFaultAction({ spaceSlug, machineId, title: form.get("title"), severity: form.get("severity"), description: form.get("description") }),
            "Problem reported", (data) => { if (data) setReported(data); });
        }}>
          <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-4">
            {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
            <FaultReportFields staff={false} />
          </fieldset></DialogBody>
          <DialogFooter><Button variant="secondary" type="button" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.pending}>Report problem</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  );
}
