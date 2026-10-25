import type { FieldDefinition, FieldKind } from "@/lib/machines/fields";
import { lines } from "./formValues";

export type FieldDraft = {
  id: string; key: string; label: string; kind: FieldKind; unit: string; help: string;
  options: string; min: string; max: string; required: boolean; public: boolean;
  /** Saved fields keep their key when the label changes; stored specs are found by key. */
  saved: boolean;
};

export function fieldDraft(field: FieldDefinition, id: string, saved = true): FieldDraft {
  return { id, saved, key: field.key, label: field.label, kind: field.kind, unit: field.unit ?? "", help: field.help ?? "",
    options: field.options?.join("\n") ?? "", min: field.min?.toString() ?? "", max: field.max?.toString() ?? "",
    required: field.required ?? false, public: field.public ?? false };
}

export function fieldValue(draft: FieldDraft): FieldDefinition {
  return { key: draft.key, label: draft.label, kind: draft.kind, unit: draft.unit, help: draft.help,
    ...(draft.kind === "select" || draft.kind === "multiselect" ? { options: lines(draft.options) } : {}),
    ...(draft.min.trim() ? { min: Number(draft.min) } : {}), ...(draft.max.trim() ? { max: Number(draft.max) } : {}),
    required: draft.required, public: draft.public };
}
