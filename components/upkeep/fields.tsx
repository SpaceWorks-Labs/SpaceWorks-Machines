"use client";

import { CheckboxField } from "@/components/ui/choice";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { DOWNTIME_REASONS, FAULT_SEVERITIES, FAULT_STATUSES, MAINTENANCE_KINDS, MAINTENANCE_TRIGGERS } from "@/lib/upkeep/schemas";
import { FAULT_STATUS_LABELS, KIND_LABELS, REASON_LABELS, SEVERITY_LABELS, TRIGGER_LABELS } from "@/lib/upkeep/labels";

/** Field groups for the upkeep dialogs. Names match lib/upkeep/schemas.ts. */

export type ScheduleValues = { title: string; description: string; checklist: string[]; trigger: string; intervalDays: number | null;
  intervalHours: number | null; intervalJobs: number | null; blockWhenOverdue: boolean; isActive: boolean };

export function ScheduleFields({ values, edit = false }: { values?: ScheduleValues; edit?: boolean }) {
  return <>
    <Field label="Title"><Input name="title" required maxLength={120} defaultValue={values?.title} /></Field>
    <Field label="Repeats"><Dropdown name="trigger" defaultValue={values?.trigger ?? "TIME"}>
      {MAINTENANCE_TRIGGERS.map((value) => <option key={value} value={value}>{TRIGGER_LABELS[value]}</option>)}</Dropdown></Field>
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Days" optional helperText="For time schedules"><Input name="intervalDays" type="number" min={1} max={3650} defaultValue={values?.intervalDays ?? ""} /></Field>
      <Field label="Machine hours" optional helperText="For hour schedules"><Input name="intervalHours" type="number" min={1} defaultValue={values?.intervalHours ?? ""} /></Field>
      <Field label="Jobs" optional helperText="For job-count schedules"><Input name="intervalJobs" type="number" min={1} defaultValue={values?.intervalJobs ?? ""} /></Field>
    </div>
    <Field label={edit ? "Move the next due date" : "First due date"} optional helperText="Time schedules only. Leave blank to count from today."><Input name="firstDueOn" type="date" /></Field>
    <Field label="Description" optional><Textarea name="description" maxLength={2000} defaultValue={values?.description} /></Field>
    <Field label="Checklist" optional helperText="One step per line."><Textarea name="checklist" defaultValue={values?.checklist.join("\n")} /></Field>
    <CheckboxField name="blockWhenOverdue" defaultChecked={values?.blockWhenOverdue} label="Take the machine out of service when overdue" description="Opens downtime and sets the machine to maintenance once it's idle." />
    {edit ? <CheckboxField name="isActive" defaultChecked={values?.isActive ?? true} label="Active" description="Paused schedules don't remind or block." /> : null}
  </>;
}

export function LogFields({ schedules, faults }: { schedules: { id: string; title: string }[]; faults: { id: string; label: string }[] }) {
  return <>
    <Field label="What was done"><Input name="summary" required maxLength={200} /></Field>
    <Field label="Kind"><Dropdown name="kind" defaultValue="PREVENTIVE">{MAINTENANCE_KINDS.map((value) => <option key={value} value={value}>{KIND_LABELS[value]}</option>)}</Dropdown></Field>
    {schedules.length ? <Field label="Completes schedule" optional><Dropdown name="scheduleId" defaultValue=""><option value="">None</option>
      {schedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.title}</option>)}</Dropdown></Field> : null}
    {faults.length ? <Field label="For fault" optional><Dropdown name="faultId" defaultValue=""><option value="">None</option>
      {faults.map((fault) => <option key={fault.id} value={fault.id}>{fault.label}</option>)}</Dropdown></Field> : null}
    <Field label="Date" optional helperText="Leave blank for today."><Input name="performedOn" type="date" /></Field>
    <Field label="Details" optional><Textarea name="details" maxLength={5000} /></Field>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Parts" optional><Input name="partsNote" maxLength={2000} /></Field>
      <Field label="Vendor" optional><Input name="vendor" maxLength={200} /></Field>
    </div>
    <Field label="Cost" optional helperText="In the space currency."><Input name="cost" inputMode="decimal" maxLength={32} /></Field>
    <CheckboxField name="restoreIdle" label="Set the machine back to idle" description="Ends open downtime." />
  </>;
}

export function DowntimeFields() {
  return <>
    <Field label="Reason"><Dropdown name="reason" defaultValue="PLANNED_MAINTENANCE">{DOWNTIME_REASONS.map((value) => <option key={value} value={value}>{REASON_LABELS[value]}</option>)}</Dropdown></Field>
    <Field label="Machine status"><Dropdown name="status" defaultValue="MAINTENANCE"><option value="MAINTENANCE">Maintenance</option><option value="OFFLINE">Offline</option></Dropdown></Field>
    <Field label="Note" optional><Textarea name="note" maxLength={2000} /></Field>
  </>;
}

export function FaultReportFields({ staff }: { staff: boolean }) {
  return <>
    <Field label="What's wrong"><Input name="title" required maxLength={120} /></Field>
    <Field label="How serious"><Dropdown name="severity" defaultValue="MEDIUM">{FAULT_SEVERITIES.map((value) => <option key={value} value={value}>{SEVERITY_LABELS[value]!.label}</option>)}</Dropdown></Field>
    <Field label="Details" optional><Textarea name="description" maxLength={5000} /></Field>
    {staff ? <CheckboxField name="takeOffline" label="Take the machine offline" description="High and critical faults only. Opens fault downtime." /> : null}
  </>;
}

export function FaultUpdateFields({ status, assignees, assignedToId }: { status: string; assignees: { id: string; name: string }[]; assignedToId: string | null }) {
  return <>
    <Field label="Status"><Dropdown name="status" defaultValue={status}>{FAULT_STATUSES.map((value) => <option key={value} value={value}>{FAULT_STATUS_LABELS[value]!.label}</option>)}</Dropdown></Field>
    <Field label="Assigned to" optional><Dropdown name="assignedToId" defaultValue={assignedToId ?? ""}><option value="">Nobody</option>
      {assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</Dropdown></Field>
    <Field label="Resolution" optional helperText="Required when you resolve or close the fault."><Textarea name="resolution" maxLength={2000} /></Field>
  </>;
}

export type WarrantyValues = { vendorName: string; vendorContact: string; vendorEmail: string; vendorPhone: string; contractNumber: string;
  coverage: string; purchasedOn: string; startsOn: string; expiresOn: string };

export function WarrantyFields({ values }: { values: WarrantyValues | null }) {
  const text = (name: keyof WarrantyValues, label: string, max: number, type = "text") =>
    <Field label={label} optional><Input name={name} type={type} maxLength={max} defaultValue={values?.[name] ?? ""} /></Field>;
  return <>
    <div className="grid gap-4 sm:grid-cols-2">{text("vendorName", "Vendor", 200)}{text("contractNumber", "Contract number", 120)}
      {text("vendorContact", "Contact person", 200)}{text("vendorEmail", "Email", 254, "email")}{text("vendorPhone", "Phone", 40, "tel")}</div>
    <div className="grid gap-4 sm:grid-cols-3">{text("purchasedOn", "Purchased", 10, "date")}{text("startsOn", "Starts", 10, "date")}{text("expiresOn", "Expires", 10, "date")}</div>
    <Field label="Coverage" optional><Textarea name="coverage" maxLength={2000} defaultValue={values?.coverage ?? ""} /></Field>
  </>;
}

export function UsageFields({ pools }: { pools: { id: string; label: string }[] }) {
  return <>
    <Field label="Minutes run"><Input name="minutes" type="number" min={0} required /></Field>
    <CheckboxField name="succeeded" defaultChecked label="The run succeeded" />
    {pools.length ? <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Took stock from" optional><Dropdown name="poolId" defaultValue=""><option value="">No pool</option>{pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.label}</option>)}</Dropdown></Field>
      <Field label="Quantity" optional><Input name="quantity" inputMode="decimal" maxLength={32} /></Field></div> : null}
    <Field label="Note" optional><Textarea name="note" maxLength={2000} /></Field>
  </>;
}
