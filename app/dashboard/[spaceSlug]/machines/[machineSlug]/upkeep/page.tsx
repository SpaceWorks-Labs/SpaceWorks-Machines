import Link from "next/link";
import type { Metadata } from "next";
import { loadMachineUpkeepView } from "@/lib/views/app__dashboard__spaceSlug__machines__machineSlug__upkeep__page";
import { createScheduleAction, endDowntimeAction, logMaintenanceAction, logManualUsageAction, saveWarrantyAction, startDowntimeAction, updateScheduleAction } from "@/app/actions/upkeep";
import { reportFaultAction } from "@/app/actions/faults";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState } from "@/components/ui/display";
import { MachineStatusChip } from "@/components/machines/MachineStatusChip";
import { ActionDialog } from "@/components/upkeep/ActionDialog";
import { DowntimeFields, FaultReportFields, LogFields, ScheduleFields, UsageFields, WarrantyFields } from "@/components/upkeep/fields";
import { UpkeepFileUpload } from "@/components/upkeep/UpkeepFileUpload";
import { ServiceHistory } from "@/components/upkeep/ServiceHistory";
import { BeepBoop } from "@/components/eggs/BeepBoop";
import { formatDate } from "@/lib/format/datetime";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";
import { DUE_LABELS, dueText, FAULT_STATUS_LABELS, KIND_LABELS, REASON_LABELS, SEVERITY_LABELS, TRIGGER_LABELS, WARRANTY_LABELS } from "@/lib/upkeep/labels";
import { CollapsibleSection } from "@/components/ui/collapsible";

export const metadata: Metadata = { title: "Machine upkeep", robots: { index: false, follow: false } };

export default async function MachineUpkeepPage({ params }: { params: Promise<{ spaceSlug: string; machineSlug: string }> }) {
  const view = await loadMachineUpkeepView({ params });
  const { space, machine, canManage } = view;
  const fixed = { spaceSlug: space.slug, machineId: machine.id };
  const date = (value: string) => formatDate(value, space.timezone);
  const money = (value: number) => isCurrencyCode(space.currency) ? formatMoney(value, space.currency) : String(value);
  return (
    <div className="flex flex-col gap-7 pb-4">
      <div><Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/machines/${machine.slug}`}>Back to {machine.name}</Link></Button></div>
      <SpacePageHeader space={space} title={`Upkeep: ${machine.name}`} description={`${machine.hours} machine hours · ${machine.jobs} runs logged`}
        actions={<><MachineStatusChip status={machine.status} /><BeepBoop machineId={machine.id} status={machine.status} />
          {view.canReport && !machine.retired ? <ActionDialog action={reportFaultAction} fixed={fixed} booleans={["takeOffline"]} trigger="Report a fault" title="Report a fault" submitLabel="Report fault" success="Fault reported"><FaultReportFields staff={canManage} /></ActionDialog> : null}
          {view.canLogUsage && !machine.retired ? <ActionDialog action={logManualUsageAction} fixed={fixed} booleans={["succeeded"]} trigger="Log a run" title="Log a run outside the queue" submitLabel="Log run" success="Run logged"><UsageFields pools={view.pools} /></ActionDialog> : null}
          {canManage && !machine.retired && (view.openDowntime || (machine.status !== "RUNNING" && machine.status !== "PAUSED")) ? (view.openDowntime
            ? <ActionDialog action={endDowntimeAction} fixed={fixed} trigger="End downtime" title="End downtime" description="The machine goes back to idle." submitLabel="End downtime" success="Downtime ended"><p className="text-body-ui">End the open downtime window for {machine.name}?</p></ActionDialog>
            : <ActionDialog action={startDowntimeAction} fixed={fixed} trigger="Start downtime" title="Start downtime" submitLabel="Start downtime" success="Downtime started"><DowntimeFields /></ActionDialog>) : null}</>} />

      <CollapsibleSection id="upkeep-schedules" label="Maintenance schedules" title="Schedules" description={`Reminders go out ${view.settings.maintenanceReminderDays} days before a time schedule is due, or within 10% of a usage interval.`}
          action={canManage && !machine.retired ? <ActionDialog action={createScheduleAction} fixed={fixed} booleans={["blockWhenOverdue"]} trigger="Add schedule" title="Add a maintenance schedule" submitLabel="Add schedule" success="Schedule added"><ScheduleFields /></ActionDialog> : null} count={view.schedules.length}>
        {view.schedules.length ? <ul className="flex flex-col divide-y divide-line">{view.schedules.map((schedule) => (
          <li key={schedule.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="break-words text-label">{schedule.title}</p>
              <p className="text-caption text-ink-muted">{TRIGGER_LABELS[schedule.trigger]} · {schedule.isActive ? dueText(schedule.due) : "Paused"}{schedule.lastDoneAt ? ` · last done ${date(schedule.lastDoneAt)}` : ""}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              {schedule.isActive ? <Chip tone={DUE_LABELS[schedule.due.state].tone}>{DUE_LABELS[schedule.due.state].label}</Chip> : <Chip tone="outline">Paused</Chip>}
              {canManage ? <ActionDialog action={updateScheduleAction} fixed={{ spaceSlug: space.slug, scheduleId: schedule.id }} booleans={["blockWhenOverdue", "isActive"]} trigger={<>Edit<span className="sr-only"> {schedule.title}</span></>} title={`Edit ${schedule.title}`} submitLabel="Save schedule" success="Schedule saved"><ScheduleFields values={schedule} edit /></ActionDialog> : null}
            </div></li>))}</ul>
          : <EmptyState title="No schedules yet">Add one to get reminders by date, machine hours or job count.</EmptyState>}
      </CollapsibleSection>

      <CollapsibleSection id="upkeep-records" label="Maintenance records" title="Maintenance records" description="Records can't be edited or deleted once saved."
          action={canManage ? <ActionDialog action={logMaintenanceAction} fixed={fixed} booleans={["restoreIdle"]} trigger="Log maintenance" triggerVariant="primary" title="Log maintenance" submitLabel="Save record" success="Maintenance logged">
            <LogFields money={view.canFinance} schedules={view.schedules.filter((s) => s.isActive).map((s) => ({ id: s.id, title: s.title }))} faults={view.faults.filter((f) => f.status !== "RESOLVED" && f.status !== "WONT_FIX").map((f) => ({ id: f.id, label: `${f.label} ${f.title}` }))} /></ActionDialog> : null} count={view.logs.length}>
        {view.logs.length ? <ul className="flex flex-col divide-y divide-line">{view.logs.map((log) => (
          <li key={log.id} className="flex flex-col gap-2 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="min-w-0 break-words text-label">{log.summary}</p><p className="text-caption text-ink-muted">{date(log.performedAt)}</p></div>
            <p className="text-caption text-ink-muted">{[KIND_LABELS[log.kind], log.schedule, log.vendor, log.cost != null ? money(log.cost) : null].filter(Boolean).join(" · ")}</p>
            {log.details ? <p className="whitespace-pre-wrap break-words text-body-ui">{log.details}</p> : null}
            {log.attachments.length ? <ul className="flex flex-wrap gap-3">{log.attachments.map((file) => <li key={file.id} className="min-w-0"><a className="break-all text-label underline underline-offset-4" href={file.url}>{file.filename}</a></li>)}</ul> : null}
            {canManage ? <UpkeepFileUpload spaceSlug={space.slug} kind="maintenance" targetId={log.id} label="Attach a file" /> : null}
          </li>))}</ul> : <EmptyState title="No records yet">Log maintenance as it happens to build the machine&rsquo;s service history.</EmptyState>}
      </CollapsibleSection>

      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-2">
        <CollapsibleSection id="upkeep-faults" label="Faults" title="Faults" action={<Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/maintenance/faults`}>All faults</Link></Button>} count={view.faults.length}>
          {view.faults.length ? <ul className="flex flex-col divide-y divide-line">{view.faults.map((fault) => (
            <li key={fault.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link className="min-w-0 break-words text-label underline underline-offset-4" href={`/dashboard/${space.slug}/maintenance/faults/${fault.number}`}>{fault.label} {fault.title}</Link>
              <span className="flex flex-wrap gap-2"><Chip size="sm" tone={SEVERITY_LABELS[fault.severity]!.tone}>{SEVERITY_LABELS[fault.severity]!.label}</Chip><Chip size="sm" tone={FAULT_STATUS_LABELS[fault.status]!.tone}>{FAULT_STATUS_LABELS[fault.status]!.label}</Chip></span>
            </li>))}</ul> : <p className="text-body-ui text-ink-muted">No faults reported.</p>}
        </CollapsibleSection>
        <CollapsibleSection id="upkeep-downtime" label="Downtime" title="Downtime" count={view.downtime.length}>
          {view.downtime.length ? <ul className="flex flex-col divide-y divide-line">{view.downtime.map((row) => (
            <li key={row.id} className="py-2"><p className="flex flex-wrap items-center gap-2 text-label">{REASON_LABELS[row.reason]}{row.endedAt ? null : <Chip size="sm" tone="warning">Open</Chip>}</p>
              <p className="text-caption text-ink-muted">{date(row.startedAt)}{row.endedAt ? ` to ${date(row.endedAt)}` : ""}{row.note ? ` · ${row.note}` : ""}</p></li>))}</ul>
            : <p className="text-body-ui text-ink-muted">No downtime recorded.</p>}
        </CollapsibleSection>
      </div>

      <CollapsibleSection id="upkeep-warranty" label="Warranty" title="Warranty" description={view.warranty ? undefined : "No warranty recorded."}
          action={<span className="flex flex-wrap items-center gap-2">{view.warranty ? <Chip tone={WARRANTY_LABELS[view.warranty.state].tone}>{WARRANTY_LABELS[view.warranty.state].label}</Chip> : null}
            {canManage ? <ActionDialog action={saveWarrantyAction} fixed={fixed} trigger={view.warranty ? "Edit warranty" : "Add warranty"} title="Warranty" submitLabel="Save warranty" success="Warranty saved"><WarrantyFields values={view.warranty?.values ?? null} /></ActionDialog> : null}</span>} startOpen={Boolean(view.warranty)}>
        {view.warranty ? <div className="flex flex-col gap-3">
          <p className="break-words text-body-ui">{[view.warranty.values.vendorName, view.warranty.values.contractNumber && `Contract ${view.warranty.values.contractNumber}`, view.warranty.values.expiresOn && `Expires ${view.warranty.values.expiresOn}`].filter(Boolean).join(" · ") || "No details yet."}</p>
          {view.warranty.values.coverage ? <p className="whitespace-pre-wrap break-words text-body-ui text-ink-secondary">{view.warranty.values.coverage}</p> : null}
          {view.warranty.documents.length ? <ul className="flex flex-wrap gap-3">{view.warranty.documents.map((file) => <li key={file.id} className="min-w-0"><a className="break-all text-label underline underline-offset-4" href={file.url}>{file.filename}</a></li>)}</ul> : null}
          {canManage ? <UpkeepFileUpload spaceSlug={space.slug} kind="warranty" targetId={machine.id} label="Add a warranty document" /> : null}
        </div> : null}
      </CollapsibleSection>

      <ServiceHistory entries={view.history} timeZone={space.timezone} />
    </div>
  );
}
