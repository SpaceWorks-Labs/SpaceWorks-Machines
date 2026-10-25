import { CheckboxField } from "@/components/ui/choice";
import { Dropdown, Field, Input } from "@/components/ui/field";
import type { FieldContext, FieldDefinition } from "@/lib/machines/fields";

export function RequestFields({ fields, context }: { fields: FieldDefinition[]; context: FieldContext }) {
  return fields.map((f) => {
    const name = `request.${f.key}`;
    const label = `${f.label}${f.unit ? ` (${f.unit})` : ""}`;
    const choices = f.kind === "material" ? context.materials : f.kind === "colour" ? context.colours : f.options;
    if (f.kind === "dimensions") return <fieldset key={f.key} className="flex flex-col gap-3"><legend className="text-label">{label}</legend>
      <div className="grid grid-cols-3 gap-3">{["x", "y", "z"].map((axis) => <Field key={axis} label={axis.toUpperCase()} optional={axis === "z"}><Input name={`${name}.${axis}`} type="number" step="any" min="0" required={f.required && axis !== "z"} /></Field>)}</div></fieldset>;
    if (f.kind === "multiselect") return <fieldset key={f.key} className="flex flex-col gap-2"><legend className="text-label">{label}{f.required ? " (choose at least one)" : ""}</legend>
      {choices?.map((option) => <CheckboxField key={option} name={name} value={option} label={option} />)}</fieldset>;
    return <Field key={f.key} label={label} helperText={f.help} optional={!f.required}>
      {f.kind === "boolean" || (choices?.length && ["select", "material", "colour"].includes(f.kind)) ? <Dropdown name={name} required={f.required}>
        <option value="">Choose {f.label.toLowerCase()}</option>{["material", "colour"].includes(f.kind) && !choices?.some((v) => v.toLowerCase() === "no preference") ? <option value="No preference">No preference</option> : null}{f.kind === "boolean" ? <><option value="true">Yes</option><option value="false">No</option></> : choices?.map((v) => <option key={v} value={v}>{v}</option>)}
      </Dropdown> : <Input name={name} required={f.required} type={f.kind === "number" ? "number" : "text"} step="any" min={f.min} max={f.max} maxLength={500} />}
    </Field>;
  });
}
