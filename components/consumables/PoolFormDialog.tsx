"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPoolAction, updatePoolAction } from "@/app/actions/consumables";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import type { PoolRow } from "@/lib/machines/queries";
import { PoolDetailsFields } from "./PoolDetailsFields";
import { PoolCreationFields } from "./PoolCreationFields";
import { readPoolCreation, readPoolDetails, type PoolChoices } from "./formValues";

export function PoolFormDialog({ spaceSlug, currency, pool, choices }: { spaceSlug: string; currency: string; pool?: PoolRow; choices?: PoolChoices }) {
  const [open, setOpen] = useState(false);
  const mutation = useMachineMutation();
  const router = useRouter();
  const label = pool ? "Edit pool" : "Create pool";
  return <Dialog open={open} onOpenChange={(open) => { if (!mutation.pending) setOpen(open); }}>
    <DialogTrigger asChild><Button variant={pool ? "secondary" : "primary"} size={pool ? "sm" : "md"}>{label}</Button></DialogTrigger>
    <DialogContent size="lg"><DialogHeader title={pool ? `Edit ${pool.material} pool` : "Create consumable pool"}
      description={pool ? "Quantities change through restocks and corrections. The unit and binding are fixed." : "Record the material, where it is used and its opening stock."} />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        if (pool) mutation.run(() => updatePoolAction({ spaceSlug, poolId: pool.id, ...readPoolDetails(data) }), "Pool saved", () => setOpen(false));
        else mutation.run(() => createPoolAction({ spaceSlug, ...readPoolCreation(data) }), "Pool created", (result) => {
          setOpen(false);
          if (result) router.push(`/dashboard/${spaceSlug}/consumables/${result.poolId}`);
        });
      }}>
        <DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-5">
          {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
          <PoolDetailsFields pool={pool} currency={currency} errors={mutation.fieldErrors} />
          {!pool && choices ? <PoolCreationFields choices={choices} errors={mutation.fieldErrors} /> : null}
        </fieldset></DialogBody>
        <DialogFooter><Button variant="secondary" type="button" disabled={mutation.pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={mutation.pending}>{pool ? "Save pool" : label}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
