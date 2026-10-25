import Link from "next/link";
import type { Metadata } from "next";
import { loadMaintenanceView } from "@/lib/views/app__dashboard__spaceSlug__maintenance__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { Button } from "@/components/ui/button";
import { Chip, StatTile } from "@/components/ui/display";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { formatDate } from "@/lib/format/datetime";
import { DUE_LABELS, dueText, FAULT_STATUS_LABELS, REASON_LABELS, SEVERITY_LABELS, WARRANTY_LABELS } from "@/lib/upkeep/labels";

export const metadata: Metadata = { title: "Maintenance", robots: { index: false, follow: false } };

export default async function MaintenancePage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const view = await loadMaintenanceView({ params });
  const { space, counts } = view;
  const machineLink = (slug: string, name: string) => <Link className="text-label underline" href={`/dashboard/${space.slug}/machines/${slug}/upkeep`}>{name}</Link>;
  return (
    <div className="flex flex-col gap-7 pb-4">
      <SpacePageHeader space={space} title="Maintenance" description="Schedules that need attention, open faults, downtime and warranties."
        actions={<Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/maintenance/faults`}>All faults</Link></Button>} />
      <section aria-label="Upkeep at a glance" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Overdue" value={counts.overdue} tone={counts.overdue ? "attention" : "default"} />
        <StatTile label="Due soon" value={counts.dueSoon} />
        <StatTile label="Open faults" value={counts.faults} tone={counts.faults ? "attention" : "default"} href={`/dashboard/${space.slug}/maintenance/faults`} />
        <StatTile label="Machines down" value={counts.down} />
      </section>
      <CollapsibleSection id="maintenance-attention" label="Schedules needing attention" title="Needs attention" count={view.attention.length}
        description="Open a machine's upkeep to log the work; the schedule then moves on.">
        {view.attention.length ? <ul className="flex flex-col divide-y divide-line">{view.attention.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="text-label">{row.title}</p><p className="text-caption text-ink-muted">{machineLink(row.machineSlug, row.machine)} · {dueText(row.due)}</p></div>
            <Chip tone={DUE_LABELS[row.due.state].tone}>{DUE_LABELS[row.due.state].label}</Chip>
          </li>))}</ul> : <p className="text-body-ui text-ink-muted">Every schedule is on track.</p>}
      </CollapsibleSection>
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-2">
        <CollapsibleSection id="maintenance-faults" title="Open faults" count={view.faults.length}>
          {view.faults.length ? <ul className="flex flex-col divide-y divide-line">{view.faults.map((fault) => (
            <li key={fault.number} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0"><Link className="text-label underline" href={`/dashboard/${space.slug}/maintenance/faults/${fault.number}`}>{fault.label} {fault.title}</Link>
                <span className="block text-caption text-ink-muted">{fault.machine} · {formatDate(fault.createdAt, space.timezone)}</span></span>
              <span className="flex gap-2"><Chip size="sm" tone={SEVERITY_LABELS[fault.severity]!.tone}>{SEVERITY_LABELS[fault.severity]!.label}</Chip><Chip size="sm" tone={FAULT_STATUS_LABELS[fault.status]!.tone}>{FAULT_STATUS_LABELS[fault.status]!.label}</Chip></span>
            </li>))}</ul> : <p className="text-body-ui text-ink-muted">No open faults.</p>}
        </CollapsibleSection>
        <CollapsibleSection id="maintenance-down" title="Machines down" count={view.downtime.length}>
          {view.downtime.length ? <ul className="flex flex-col divide-y divide-line">{view.downtime.map((row) => (
            <li key={row.id} className="py-2">{machineLink(row.machineSlug, row.machine)}<span className="block text-caption text-ink-muted">{REASON_LABELS[row.reason]} since {formatDate(row.startedAt, space.timezone)}</span></li>))}</ul>
            : <p className="text-body-ui text-ink-muted">Every machine is in service.</p>}
        </CollapsibleSection>
      </div>
      <CollapsibleSection id="maintenance-warranties" label="Warranties" title="Warranties expiring or expired" count={view.expiring.length}>
        {view.expiring.length ? <ul className="flex flex-col divide-y divide-line">{view.expiring.map((row) => (
          <li key={row.machineSlug} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{machineLink(row.machineSlug, row.machine)}<span className="block text-caption text-ink-muted">{[row.vendor, `Expires ${row.expiresOn}`].filter(Boolean).join(" · ")}</span></span>
            <Chip size="sm" tone={WARRANTY_LABELS[row.state].tone}>{WARRANTY_LABELS[row.state].label}</Chip>
          </li>))}</ul> : <p className="text-body-ui text-ink-muted">No warranty needs attention.</p>}
      </CollapsibleSection>
    </div>
  );
}
