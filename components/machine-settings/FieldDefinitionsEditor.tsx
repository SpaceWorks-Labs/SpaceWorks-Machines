"use client";

import { useState } from "react";
import { updateMachineTypeSection } from "@/app/actions/machine-types";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { MAX_FIELDS, type FieldDefinition } from "@/lib/machines/fields";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { fieldDraft, fieldValue } from "./fieldDrafts";
import { sectionError } from "./formValues";
import { FieldDefinitionCard } from "./FieldDefinitionCard";

export function FieldDefinitionsEditor({ spaceSlug, typeId, section, fields, canManage }: {
  spaceSlug: string; typeId: string; section: "specFields" | "requestFields"; fields: FieldDefinition[]; canManage: boolean;
}) {
  const [drafts, setDrafts] = useState(() => fields.map((field, index) => fieldDraft(field, `stored-${index}`)));
  const mutation = useMachineMutation();
  // Index-based validation belongs to the submitted order; clear it when the order changes.
  const [structureChanged, setStructureChanged] = useState(false);
  const errors = structureChanged ? {} : mutation.fieldErrors;
  return <form className="flex flex-col gap-5" onSubmit={(event) => {
    event.preventDefault();
    setStructureChanged(false);
    mutation.run(() => updateMachineTypeSection({ spaceSlug, typeId, section, values: { [section]: drafts.map(fieldValue) } }), "Fields saved",
      () => setDrafts((current) => current.map((item) => ({ ...item, saved: true }))));
  }}>
    <p className="text-body-ui text-ink-secondary">Changing fields never invalidates stored machine specifications. Removed or unknown keys are kept but hidden; missing required values only warn.</p>
    {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
    {errors[`values.${section}`] ? <p role="alert" className="text-caption text-danger-fg">{sectionError(errors, section)}</p> : null}
    <fieldset disabled={!canManage || mutation.pending} className="flex flex-col gap-4">
      {!drafts.length ? <p className="text-body-ui text-ink-muted">No fields yet.{canManage ? " Add a field to start." : ""}</p> : null}
      {drafts.map((draft, index) => <FieldDefinitionCard key={draft.id} draft={draft} index={index} count={drafts.length} section={section} errors={errors} canManage={canManage}
        onChange={(patch) => setDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, ...patch } : item))}
        onRemove={() => { setStructureChanged(true); setDrafts((current) => current.filter((item) => item.id !== draft.id)); }}
        onMove={(offset) => { setStructureChanged(true); setDrafts((current) => {
          const next = [...current];
          [next[index], next[index + offset]] = [next[index + offset], next[index]];
          return next;
        }); }} />)}
      {canManage ? <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="secondary" disabled={drafts.length >= MAX_FIELDS} onClick={() => {
        setStructureChanged(true);
        setDrafts((current) => [...current, fieldDraft({ key: "", label: "", kind: "text" }, crypto.randomUUID(), false)]);
      }}>Add field</Button>{drafts.length >= MAX_FIELDS ? <p className="text-caption text-ink-muted">A type holds up to {MAX_FIELDS} fields. Remove one to add another.</p> : null}</div> : null}
    </fieldset>
    {canManage ? <div><Button type="submit" variant="primary" loading={mutation.pending}>Save fields</Button></div> : <p className="text-caption text-ink-muted">A machine manager can change these fields.</p>}
  </form>;
}
