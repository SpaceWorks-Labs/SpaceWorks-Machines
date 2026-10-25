"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { Field, Input, Textarea, Dropdown } from "@/components/ui/field";
import { CheckboxField } from "@/components/ui/choice";
import { FIELD_KINDS, SPEC_FIELD_KINDS, FIELD_KIND_LABELS, fieldKeyFromLabel, type FieldKind } from "@/lib/machines/fields";
import type { FieldDraft } from "./fieldDrafts";

export function FieldDefinitionCard({ draft, index, count, section, errors, canManage, onChange, onMove, onRemove }: {
  draft: FieldDraft; index: number; count: number; section: "specFields" | "requestFields";
  errors: Record<string, string[]>; canManage: boolean; onChange: (patch: Partial<FieldDraft>) => void;
  onMove: (offset: number) => void; onRemove: () => void;
}) {
  const error = (key: string) => {
    const path = `values.${section}.${index}.${key}`;
    return Object.entries(errors).filter(([name]) => name === path || name.startsWith(`${path}.`)).flatMap(([, messages]) => messages).join(" ");
  };
  const kinds = section === "specFields" ? SPEC_FIELD_KINDS : FIELD_KINDS;
  return <Card as="section" aria-label={`Field ${index + 1}`}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h3 className="min-w-0 break-words text-title text-ink">Field {index + 1}{draft.label ? `: ${draft.label}` : ""}</h3>
      {canManage ? <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={index === 0} aria-label={`Move field ${index + 1} up`} onClick={() => onMove(-1)}>Move up</Button>
        <Button type="button" variant="secondary" size="sm" disabled={index === count - 1} aria-label={`Move field ${index + 1} down`} onClick={() => onMove(1)}>Move down</Button>
        <Button type="button" variant="dangerQuiet" size="sm" aria-label={`Remove field ${index + 1}`} onClick={onRemove}>Remove field</Button>
      </div> : null}
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Label" error={error("label")}><Input value={draft.label} maxLength={60} onChange={(event) => {
        const label = event.target.value;
        onChange({ label, ...(!draft.saved && (draft.key === "" || draft.key === fieldKeyFromLabel(draft.label)) ? { key: fieldKeyFromLabel(label) } : {}) });
      }} /></Field>
      <Field label="Key slug" helperText="Lowercase letters, digits and underscores. Changing a key hides its old stored values." error={error("key")}>
        <Input value={draft.key} maxLength={40} onChange={(event) => onChange({ key: event.target.value })} />
      </Field>
      <Field label="Kind" error={error("kind")}><Dropdown value={draft.kind} onChange={(event) => onChange({ kind: event.target.value as FieldKind })}>
        {kinds.map((kind) => <option key={kind} value={kind}>{FIELD_KIND_LABELS[kind]}</option>)}
      </Dropdown></Field>
      <Field label="Unit" optional error={error("unit")}><Input value={draft.unit} maxLength={16} onChange={(event) => onChange({ unit: event.target.value })} /></Field>
      <Field label="Help text" optional error={error("help")} className="sm:col-span-2"><Input value={draft.help} maxLength={160} onChange={(event) => onChange({ help: event.target.value })} /></Field>
      {draft.kind === "select" || draft.kind === "multiselect" ? <Field label="Options" helperText="One option per line." error={error("options")} className="sm:col-span-2">
        <Textarea value={draft.options} onChange={(event) => onChange({ options: event.target.value })} />
      </Field> : null}
      {draft.kind === "number" ? <>
        <Field label="Minimum" optional error={error("min")}><Input type="number" step="any" value={draft.min} onChange={(event) => onChange({ min: event.target.value })} /></Field>
        <Field label="Maximum" optional error={error("max")}><Input type="number" step="any" value={draft.max} onChange={(event) => onChange({ max: event.target.value })} /></Field>
      </> : null}
      <div><CheckboxField label="Required" checked={draft.required} onCheckedChange={(value) => onChange({ required: value === true })} />
        {error("required") ? <p className="text-caption text-danger-fg">{error("required")}</p> : null}</div>
      <div><CheckboxField label="Public" description="Applies to specifications shown on public machine pages." checked={draft.public} onCheckedChange={(value) => onChange({ public: value === true })} />
        {error("public") ? <p className="text-caption text-danger-fg">{error("public")}</p> : null}</div>
    </div>
  </Card>;
}
