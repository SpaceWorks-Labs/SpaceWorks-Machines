"use client";

import { useState } from "react";
import { setPoolPublicAction } from "@/app/actions/consumables";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useMachineMutation } from "@/components/machines/useMachineMutation";

export function PoolPublicDialog({ spaceSlug, pool }: { spaceSlug: string; pool: { id: string; material: string; isPublic: boolean } }) {
  const [open, setOpen] = useState(false);
  const mutation = useMachineMutation();
  const label = pool.isPublic ? "Make staff only" : "Make public";
  return <>
    <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{label}</Button>
    <ConfirmDialog open={open} title={`${label}: ${pool.material}?`} confirmLabel={label} destructive={false} loading={mutation.pending}
      message={pool.isPublic ? "This pool will be hidden from the public catalogue." : "This material will be available in the public catalogue while the pool is active."}
      onCancel={() => setOpen(false)} onConfirm={() => mutation.run(() => setPoolPublicAction({ spaceSlug, poolId: pool.id, isPublic: !pool.isPublic }), "Pool visibility saved", () => setOpen(false))}>
      {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
    </ConfirmDialog>
  </>;
}
