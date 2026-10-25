import { Field, Input, Textarea, Dropdown } from "@/components/ui/field";
import { CheckboxField } from "@/components/ui/choice";
import type { JobCommand } from "@/lib/jobs/commands";

export type CommandOptions = { machines?: { id: string; name: string }[]; pools?: { id: string; material: string; colour: string; unit: string }[];
  currency: string; canMoney?: boolean; estimatedMinutes?: number | null; estimatedQuantity?: string; machineId?: string | null };
export function JobCommandFields({ kind, options: o, override = false }: { kind: JobCommand["kind"]; options: CommandOptions; override?: boolean }) {
  return <>
    {kind === "approve" ? <>
      <Field label="Estimated minutes" optional><Input name="estimatedMinutes" type="number" min="0" step="1" defaultValue={o.estimatedMinutes ?? ""} /></Field>
      <Field label="Estimated material quantity" optional><Input name="estimatedQuantity" type="number" min="0" step="0.001" defaultValue={o.estimatedQuantity} /></Field>
      <Field label="Approval note" optional><Textarea name="note" maxLength={2000} /></Field>
      {o.canMoney ? <><Field label={`Price override (${o.currency})`} optional><Input name="priceOverride" inputMode="decimal" /></Field><Field label="Price override reason" helperText="Required when overriding the price." optional><Textarea name="reason" maxLength={2000} /></Field></> : null}
    </> : null}
    {["reject", "cancel", "fail"].includes(kind) ? <Field label="Reason"><Textarea name="reason" required maxLength={2000} /></Field> : null}
    {kind === "start" || kind === "reassign" ? <Field label="Machine" helperText={kind === "start" ? "Leave blank to use the requested machine or the type's allocation policy." : "Leave blank to clear the assignment."} optional>
      <Dropdown name="machineId" defaultValue={o.machineId ?? ""}><option value="">No selection</option>{o.machines?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Dropdown>
    </Field> : null}
    {kind === "start" ? <>
      <Field label="Consumable pool" optional><Dropdown name="poolId"><option value="">No consumables</option>{o.pools?.map((p) => <option key={p.id} value={p.id}>{p.material} {p.colour} ({p.unit.toLowerCase()})</option>)}</Dropdown></Field>
      <Field label="Planned material quantity" optional><Input name="plannedQuantity" type="number" min="0" step="0.001" defaultValue={o.estimatedQuantity} /></Field>
    </> : null}
    {kind === "complete" || kind === "fail" ? <>
      <Field label="Actual minutes"><Input name="actualMinutes" type="number" min="0" step="1" required defaultValue={o.estimatedMinutes ?? ""} /></Field>
      <Field label="Actual material quantity" optional><Input name="actualQuantity" type="number" min="0" step="0.001" /></Field>
    </> : null}
    {kind === "fail" ? <Field label="Percent completed"><Input name="percent" type="number" required min="0" max="100" step="1" /></Field> : null}
    {kind === "priority" ? <Field label="Priority" helperText="Higher numbers go first."><Input name="priority" type="number" min="0" step="1" required /></Field> : null}
    {kind === "note" ? <><Field label="Note"><Textarea name="body" required maxLength={2000} /></Field>{o.canMoney !== undefined ? <CheckboxField name="internal" label="Internal note (staff only)" /> : null}</> : null}
    {override ? <Field label="Payment override reason"><Textarea name="paymentOverrideReason" required maxLength={2000} /></Field> : null}
  </>;
}
