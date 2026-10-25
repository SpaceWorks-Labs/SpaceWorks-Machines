import Link from "next/link";
import type { Metadata } from "next";
import { loadMachineView } from "@/lib/views/app__dashboard__spaceSlug__machines__machineSlug__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Callout, Chip } from "@/components/ui/display";
import { MachineStatusChip } from "@/components/machines/MachineStatusChip";
import { BeepBoop } from "@/components/eggs/BeepBoop";
import { MachineStatusDialog } from "@/components/machines/MachineStatusDialog";
import { MachineRetireButton } from "@/components/machines/MachineRetireButton";
import { MachineFlags } from "@/components/machines/MachineFlags";
import { MachineDetailsForm } from "@/components/machines/MachineDetailsForm";
import { MachineDetailsReadOnly } from "@/components/machines/MachineDetailsReadOnly";
import { MachinePhotosPanel } from "@/components/machines/MachinePhotosPanel";
import { MachineDocumentsPanel } from "@/components/machines/MachineDocumentsPanel";

export const metadata: Metadata = { title: "Machine", robots: { index: false, follow: false } };

export default async function MachinePage({ params }: { params: Promise<{ spaceSlug: string; machineSlug: string }> }) {
  const view = await loadMachineView({ params });
  const { space, machine, type, details, canManage } = view;
  const context = { spaceSlug: space.slug, machineId: machine.id, canManage };
  const missing = type.specFields.filter((field) => view.missingSpecs.includes(field.key)).map((field) => field.label);
  return (
    <div className="flex flex-col gap-7 pb-4">
      <div><Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/machines`}>Back to machines</Link></Button></div>
      <SpacePageHeader space={space} title={machine.name} description={`${type.name}${type.archived ? " · Archived type" : ""}${details.location ? ` · ${details.location}` : ""}`}
        actions={<><MachineStatusChip status={machine.status} /><BeepBoop machineId={machine.id} status={machine.status} />{machine.retired ? <Chip>Retired</Chip> : null}
          <Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/machines/${machine.slug}/upkeep`}>Upkeep</Link></Button>
          {view.canPrinters ? <Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/machines/${machine.slug}/printer`}>Printer</Link></Button> : null}
          {view.canChangeStatus && !machine.retired ? <MachineStatusDialog {...context} status={machine.status} note={machine.statusNote} /> : null}
          {canManage ? <MachineRetireButton {...context} name={machine.name} retired={machine.retired} /> : null}</>} />
      {machine.statusNote ? <Callout title="Status note"><p className="whitespace-pre-wrap break-words">{machine.statusNote}</p></Callout> : null}
      {missing.length ? <Callout tone="warning" title="Some specifications are missing">{missing.join(", ")}. You can save this machine and fill these in later.</Callout> : null}
      <Card as="section" aria-label="Public listing and job intake">
        <CardHeader title="Listing and job intake" />
        {canManage ? <MachineFlags {...context} isPublic={machine.isPublic} acceptsJobs={machine.acceptsJobs} retired={machine.retired} />
          : <div className="flex flex-wrap gap-2"><Chip tone="outline">{machine.isPublic ? "Public" : "Staff only"}</Chip><Chip tone="outline">{machine.acceptsJobs ? "Accepts jobs" : "Jobs closed"}</Chip></div>}
      </Card>
      <Card as="section" aria-label="Machine details">
        <CardHeader title="Machine details" description={`Type: ${type.name}. The machine type is fixed.`} />
        {canManage ? <MachineDetailsForm {...context} type={type} currency={space.currency} values={details} money={view.canFinance} /> : <MachineDetailsReadOnly type={type} currency={space.currency} values={details} money={view.canFinance} />}
      </Card>
      <MachinePhotosPanel {...context} photos={view.photos} />
      <MachineDocumentsPanel {...context} documents={view.documents} />
    </div>
  );
}
