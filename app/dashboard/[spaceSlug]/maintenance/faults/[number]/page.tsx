import Link from "next/link";
import type { Metadata } from "next";
import { loadFaultView } from "@/lib/views/app__dashboard__spaceSlug__maintenance__faults__number__page";
import { updateFaultAction } from "@/app/actions/upkeep";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { Button } from "@/components/ui/button";
import { Callout, Chip, DetailList } from "@/components/ui/display";
import { ActionDialog } from "@/components/upkeep/ActionDialog";
import { FaultUpdateFields } from "@/components/upkeep/fields";
import { UpkeepFileUpload } from "@/components/upkeep/UpkeepFileUpload";
import { RepairPanel } from "@/components/repairs/RepairPanel";
import { ToBuyRequestDialog } from "@/components/repairs/ToBuyActions";
import { formatDate, formatDayTime } from "@/lib/format/datetime";
import { FAULT_STATUS_LABELS, SEVERITY_LABELS } from "@/lib/upkeep/labels";
import { CollapsibleSection } from "@/components/ui/collapsible";

export const metadata: Metadata = { title: "Fault", robots: { index: false, follow: false } };

export default async function FaultPage({ params }: { params: Promise<{ spaceSlug: string; number: string }> }) {
  const view = await loadFaultView({ params });
  const { space, fault } = view;
  return (
    <div className="flex flex-col gap-7 pb-4">
      <div><Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/maintenance/faults`}>Back to faults</Link></Button></div>
      <SpacePageHeader space={space} title={`${fault.label} ${fault.title}`} description={`${fault.machine.name} · reported ${formatDayTime(fault.createdAt, space.timezone)}`}
        actions={<><Chip tone={SEVERITY_LABELS[fault.severity]!.tone}>{SEVERITY_LABELS[fault.severity]!.label}</Chip><Chip tone={FAULT_STATUS_LABELS[fault.status]!.tone}>{FAULT_STATUS_LABELS[fault.status]!.label}</Chip>
          {view.canManage && !fault.closed ? <ActionDialog action={updateFaultAction} fixed={{ spaceSlug: space.slug, faultId: fault.id }} trigger="Update fault" triggerVariant="primary" title={`Update ${fault.label}`} submitLabel="Save" success="Fault updated">
            <FaultUpdateFields status={fault.status} assignees={view.assignees} assignedToId={fault.assignedToId} /></ActionDialog> : null}</>} />
      {fault.closed && fault.resolution ? <Callout tone="success" title={fault.status === "WONT_FIX" ? "Closed without a fix" : "Resolved"}><p className="whitespace-pre-wrap break-words">{fault.resolution}</p></Callout> : null}
      <CollapsibleSection id="fault-details" label="Fault details" title="Details" action={<Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/machines/${fault.machine.slug}/upkeep`}>Machine upkeep</Link></Button>}>
        <DetailList items={[
          { label: "Machine", value: fault.machine.name },
          { label: "Reported by", value: fault.reportedBy ?? "Unknown" },
          { label: "Assigned to", value: fault.assignedTo ?? view.repair.technician?.name ?? "Nobody" },
          ...(fault.resolvedAt ? [{ label: "Closed", value: formatDate(fault.resolvedAt, space.timezone) }] : []),
        ]} />
        {fault.description ? <p className="mt-4 whitespace-pre-wrap break-words text-body-ui">{fault.description}</p> : null}
      </CollapsibleSection>
      <RepairPanel spaceSlug={space.slug} faultId={fault.id} currency={space.currency} locale={space.locale ?? undefined} timeZone={space.timezone} data={view.repair} />
      {view.canToBuy && !fault.closed ? <div><ToBuyRequestDialog spaceSlug={space.slug} machines={[]} pools={view.pools} faultId={fault.id} /></div> : null}
      <CollapsibleSection id="fault-photos" label="Photos" title="Photos" description="Up to 4 photos." count={view.photos.length}>
        {view.photos.length ? <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{view.photos.map((photo, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <li key={photo.id}><a className="block rounded-md" href={photo.url}><img src={photo.url} alt={`Fault photo ${index + 1}`} className="aspect-square w-full rounded-md border border-line object-cover" /></a></li>))}</ul>
          : <p className="mb-4 text-body-ui text-ink-muted">No photos.</p>}
        {view.canManage && !fault.closed && view.photos.length < 4 ? <UpkeepFileUpload spaceSlug={space.slug} kind="fault" targetId={fault.id} label="Add a photo" /> : null}
      </CollapsibleSection>
      <CollapsibleSection id="fault-logs" label="Maintenance for this fault" title="Maintenance for this fault" description="Log work against this fault from the machine's upkeep page." count={view.logs.length}>
        {view.logs.length ? <ul className="flex flex-col divide-y divide-line">{view.logs.map((log) => <li key={log.id} className="py-2"><span className="text-label">{log.summary}</span>
          <span className="block text-caption text-ink-muted">{formatDate(log.performedAt, space.timezone)}</span></li>)}</ul> : <p className="text-body-ui text-ink-muted">No maintenance logged yet.</p>}
      </CollapsibleSection>
    </div>
  );
}
