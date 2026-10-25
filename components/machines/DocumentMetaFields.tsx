import { Field, Input, Dropdown } from "@/components/ui/field";
import { DOCUMENT_KINDS } from "@/lib/machines/schemas";
import type { MachineDocumentRow } from "./types";

export const DOCUMENT_KIND_LABELS = { MANUAL: "Manual", SOP: "Standard operating procedure", SAFETY: "Safety", DATASHEET: "Datasheet", OTHER: "Other" };

export function DocumentMetaFields({ values, errors = {}, upload = false }: {
  values?: MachineDocumentRow; errors?: Record<string, string[]>; upload?: boolean;
}) {
  return <>
    <Field label="Document title" error={errors.title?.[0]}><Input name="title" required maxLength={120} defaultValue={values?.title} /></Field>
    <Field label="Document kind" error={errors.kind?.[0]}><Dropdown name={upload ? "documentKind" : "kind"} defaultValue={values?.kind ?? "MANUAL"}>
      {DOCUMENT_KINDS.map((kind) => <option key={kind} value={kind}>{DOCUMENT_KIND_LABELS[kind]}</option>)}
    </Dropdown></Field>
  </>;
}
