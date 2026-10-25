import { CheckboxField } from "@/components/ui/choice";
import { Dropdown, Field, Input } from "@/components/ui/field";
import type { FieldContext, FieldDefinition } from "@/lib/machines/fields";

/** Deliberately no HTML required attribute: incomplete machine specs save with a warning. */
export function SpecField({ field, value, error, context }: {
  field: FieldDefinition; value?: unknown; error?: string; context: FieldContext;
}) {
  const name = `specs.${field.key}`;
  const label = `${field.label}${field.unit ? ` (${field.unit})` : ""}`;
  const helperText = [field.help, field.required ? "Recommended. You can save without this value." : ""].filter(Boolean).join(" ") || undefined;
  if (field.kind === "dimensions") {
    const dimensions = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return (
      <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${name}-error` : undefined}>
        <legend className="mb-2 text-label text-ink">{label}</legend>
        <div className="grid grid-cols-3 gap-2">
          {["x", "y", "z"].map((axis) => <Field key={axis} label={axis.toUpperCase()} optional={axis === "z"}>
            <Input name={`${name}.${axis}`} type="number" step="any" min="0" defaultValue={String(dimensions[axis] ?? "")} aria-invalid={Boolean(error)} />
          </Field>)}
        </div>
        {helperText ? <p className="text-caption text-ink-muted">{helperText}</p> : null}
        {error ? <p id={`${name}-error`} role="alert" className="text-caption text-danger-fg">{error}</p> : null}
      </fieldset>
    );
  }
  if (field.kind === "multiselect") {
    return (
      <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${name}-error` : undefined}>
        <legend className="mb-2 text-label text-ink">{label}</legend>
        <div className="flex flex-wrap gap-4">{field.options?.map((option) => <CheckboxField key={option} name={name} value={option}
          label={option} defaultChecked={Array.isArray(value) && value.some((saved) => typeof saved === "string" && saved.toLowerCase() === option.toLowerCase())} />)}</div>
        {helperText ? <p className="text-caption text-ink-muted">{helperText}</p> : null}
        {error ? <p id={`${name}-error`} role="alert" className="text-caption text-danger-fg">{error}</p> : null}
      </fieldset>
    );
  }
  const stored = typeof value === "boolean" || typeof value === "number" || typeof value === "string" ? String(value) : "";
  if (field.kind === "boolean") return (
    <Field label={label} helperText={helperText} error={error}><Dropdown name={name} defaultValue={stored}>
      <option value="">Not specified</option><option value="true">Yes</option><option value="false">No</option>
    </Dropdown></Field>
  );
  const options = field.kind === "material" ? context.materials : field.kind === "colour" ? context.colours : field.options;
  if (field.kind === "select" || ((field.kind === "material" || field.kind === "colour") && options?.length)) return (
    <Field label={label} helperText={helperText} error={error}><Dropdown name={name} defaultValue={stored}>
      <option value="">Not specified</option>
      {stored && !options?.includes(stored) ? <option value={stored}>{stored} (previously saved)</option> : null}
      {options?.map((option) => <option key={option} value={option}>{option}</option>)}
    </Dropdown></Field>
  );
  return <Field label={label} helperText={helperText} error={error}>
    <Input name={name} type={field.kind === "number" ? "number" : "text"} step={field.kind === "number" ? "any" : undefined}
      min={field.min} max={field.max} maxLength={500} defaultValue={stored} />
  </Field>;
}
