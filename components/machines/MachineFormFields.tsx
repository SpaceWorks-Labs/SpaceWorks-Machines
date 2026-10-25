import { Field, Input, Textarea } from "@/components/ui/field";
import { SpecField } from "./SpecField";
import type { MachineDetailsInput, MachineTypeOption } from "./types";

const shortFields = [
  ["manufacturer", "Manufacturer", 80], ["model", "Model", 80], ["serialNumber", "Serial number", 80],
  ["location", "Location", 120], ["firmwareVersion", "Firmware version", 60],
] as const;

export function MachineFormFields({ type, currency, values, errors = {}, money = true }: {
  /** The purchase cost is money: shown only to the machine manager. */
  money?: boolean;
  type: MachineTypeOption; currency: string; values?: MachineDetailsInput; errors?: Record<string, string[]>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="Machine name" error={errors.name?.[0]}><Input name="name" required maxLength={80} defaultValue={values?.name} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {shortFields.map(([name, label, maxLength]) => <Field key={name} label={label} optional error={errors[name]?.[0]}>
          <Input name={name} maxLength={maxLength} defaultValue={values?.[name]} />
        </Field>)}
        <Field label="Acquired on" optional error={errors.acquiredOn?.[0]}><Input name="acquiredOn" type="date" defaultValue={values?.acquiredOn ?? ""} /></Field>
        {money ? <Field label={`Purchase cost (${currency})`} optional error={errors.purchaseCost?.[0]}><Input name="purchaseCost" inputMode="decimal" maxLength={24} defaultValue={values?.purchaseCost} /></Field> : null}
      </div>
      <Field label="Description" optional error={errors.description?.[0]}><Textarea name="description" maxLength={2000} defaultValue={values?.description} /></Field>
      <Field label="Staff notes" optional helperText="Only staff can see these notes." error={errors.notes?.[0]}><Textarea name="notes" maxLength={2000} defaultValue={values?.notes} /></Field>
      <section key={type.id} className="flex flex-col gap-4 border-t border-line pt-5" aria-label="Specifications">
        <div><h3 className="text-title text-ink">Specifications</h3><p className="text-body-ui text-ink-muted">Fields for {type.name}. Missing recommended values will not stop you saving.</p></div>
        {type.specFields.length ? type.specFields.map((field) => <SpecField key={field.key} field={field} value={values?.specs[field.key]} error={errors[`specs.${field.key}`]?.[0]}
          context={{ materials: type.materials, colours: type.colours }} />) : <p className="text-body-ui text-ink-muted">This type has no specification fields.</p>}
      </section>
    </div>
  );
}
