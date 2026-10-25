"use client";

import { CheckboxField } from "@/components/ui/choice";
import { Dropdown, Field, Input } from "@/components/ui/field";

/** The printer connection form fields (a client module so each Field gets a real element child). */
export function PrinterFields({ adapters, connection, settings }: {
  adapters: { kind: string; label: string }[];
  connection: { adapter: string; baseUrl: string; deviceId: string; hasSecret: boolean; enabled: boolean } | null;
  settings: { pollSeconds: number; syncMachineStatus: boolean; autoCompleteJobs: boolean };
}) {
  return <>
    <Field label="Connection type"><Dropdown name="adapter" defaultValue={connection?.adapter ?? "SIMULATED"}>
      {adapters.map((adapter) => <option key={adapter.kind} value={adapter.kind}>{adapter.label}</option>)}</Dropdown></Field>
    <Field label="Address" optional helperText="For network printers."><Input name="baseUrl" maxLength={300} defaultValue={connection?.baseUrl} /></Field>
    <Field label="Device ID" optional helperText="Serial number or user name, when the printer needs one."><Input name="deviceId" maxLength={120} defaultValue={connection?.deviceId} /></Field>
    <Field label="Key or access code" optional helperText={connection?.hasSecret ? "Saved. Leave blank to keep it." : "Stored encrypted and never shown again."}><Input name="secret" type="password" autoComplete="off" maxLength={500} /></Field>
    <Field label="Check every (seconds)"><Input name="pollSeconds" type="number" min={15} max={3600} defaultValue={settings.pollSeconds} /></Field>
    <CheckboxField name="enabled" defaultChecked={connection?.enabled ?? true} label="Connection on" />
    <CheckboxField name="autoCompleteJobs" defaultChecked={settings.autoCompleteJobs} label="Finish jobs from the printer" description="Complete or fail the running job when the print ends." />
    <CheckboxField name="syncMachineStatus" defaultChecked={settings.syncMachineStatus} label="Mirror printing and idle onto the machine" description="Never overrides maintenance, offline or reserved." />
  </>;
}
