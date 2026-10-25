"use client";

import Link from "next/link";
import { reorderMachineTypesAction } from "@/app/actions/machine-types";
import { Button } from "@/components/ui/button";
import { Callout, Chip, EmptyState } from "@/components/ui/display";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { machineIcon } from "@/lib/machines/icons";
import { presetByKey } from "@/lib/machines/presets";
import type { TypeSummary } from "@/lib/machines/queries";
import { TypeArchiveButton } from "./TypeArchiveButton";

export function TypesTable({ spaceSlug, types, canManage }: { spaceSlug: string; types: (TypeSummary & { machineCount: number })[]; canManage: boolean }) {
  const mutation = useMachineMutation();
  function move(index: number, offset: number) {
    const ids = types.map((type) => type.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    mutation.run(() => reorderMachineTypesAction({ spaceSlug, typeIds: ids }), "Type order saved");
  }
  if (!types.length) return <EmptyState patch title="No machine types yet">Create a type to describe what your machines can do.</EmptyState>;
  return <div className="flex flex-col gap-4">
    {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
    <Table label="Machine types"><THead><TR><TH>Type</TH><TH>Starting point</TH><TH>Machines</TH><TH>Status</TH>{canManage ? <TH>Actions</TH> : null}</TR></THead>
      <TBody>{types.map((type, index) => {
        const Icon = machineIcon(type.icon);
        return <TR key={type.id}>
          <TD><Link className="flex items-center gap-3 font-semibold underline-offset-4 hover:underline" href={`/dashboard/${spaceSlug}/machine-settings/types/${type.slug}`}><Icon aria-hidden className="size-5 shrink-0" />{type.name}</Link></TD>
          <TD>{type.presetKey ? `Preset: ${presetByKey(type.presetKey)?.name ?? type.presetKey}` : "Custom"}</TD><TD>{type.machineCount}</TD>
          <TD><Chip tone={type.archived ? "neutral" : "success"}>{type.archived ? "Archived" : "Active"}</Chip></TD>
          {canManage ? <TD><div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" aria-label={`Move ${type.name} up`} disabled={mutation.pending || index === 0} onClick={() => move(index, -1)}>Move up</Button>
            <Button variant="secondary" size="sm" aria-label={`Move ${type.name} down`} disabled={mutation.pending || index === types.length - 1} onClick={() => move(index, 1)}>Move down</Button>
            <TypeArchiveButton spaceSlug={spaceSlug} type={type} />
          </div></TD> : null}
        </TR>;
      })}</TBody>
    </Table>
  </div>;
}
