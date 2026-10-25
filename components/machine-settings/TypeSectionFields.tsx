"use client";

import { Field, Input, Textarea, Dropdown } from "@/components/ui/field";
import { CheckboxField } from "@/components/ui/choice";
import { MACHINE_ICON_NAMES, MACHINE_ICONS } from "@/lib/machines/icons";
import { MB } from "@/lib/machines/filePolicy";
import { METERING_UNITS } from "@/lib/machines/schemas";
import { METERING_UNIT_LABELS } from "@/lib/machines/presets";
import type { FullType } from "@/lib/machines/queries";
import { sectionError, type SimpleSection } from "./formValues";

export function TypeSectionFields({ section, type, errors }: { section: SimpleSection; type: FullType; errors: Record<string, string[]> }) {
  const error = (key: string) => sectionError(errors, key);
  const units = METERING_UNITS.map((unit) => <option key={unit} value={unit}>{METERING_UNIT_LABELS[unit].label}</option>);
  switch (section) {
    case "details": return <>
      <Field label="Name" error={error("name")}><Input name="name" defaultValue={type.name} required minLength={2} maxLength={60} /></Field>
      <Field label="Icon" error={error("icon")}><Dropdown name="icon" defaultValue={type.icon}>{MACHINE_ICON_NAMES.map((name) => <option key={name} value={name}>{MACHINE_ICONS[name].label}</option>)}</Dropdown></Field>
      <Field label="Description" optional error={error("description")}><Textarea name="description" defaultValue={type.description} maxLength={500} /></Field>
    </>;
    case "catalogue": return <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Metering unit" error={error("meteringUnit")}><Dropdown name="meteringUnit" defaultValue={type.meteringUnit}>{units}</Dropdown></Field>
        <Field label="Consumable unit" error={error("consumableUnit")}><Dropdown name="consumableUnit" defaultValue={type.consumableUnit ?? ""}><option value="">No consumables</option>{units}</Dropdown></Field>
      </div>
      <Field label="Materials" helperText="One material per line. Up to 50 entries." error={error("materials")}><Textarea name="materials" defaultValue={type.materials.join("\n")} /></Field>
      <Field label="Colours" helperText="One colour per line. Up to 50 entries." error={error("colours")}><Textarea name="colours" defaultValue={type.colours.join("\n")} /></Field>
    </>;
    case "filePolicy": return <>
      <Field label="Allowed extensions" helperText="Separate extensions with commas, for example stl, 3mf, obj. Leave empty to allow no files." error={error("filePolicy.extensions")}>
        <Input name="extensions" defaultValue={type.filePolicy.extensions.join(", ")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Maximum size per file (MB)" error={error("filePolicy.maxBytes")}><Input name="maxMB" type="number" step="any" required defaultValue={type.filePolicy.maxBytes / MB} /></Field>
        <Field label="Maximum files" error={error("filePolicy.maxFiles")}><Input name="maxFiles" type="number" step="1" required defaultValue={type.filePolicy.maxFiles} /></Field>
      </div>
      <CheckboxField name="required" defaultChecked={type.filePolicy.required} label="Require a file" />
      {error("filePolicy.required") ? <p role="alert" className="text-caption text-danger-fg">{error("filePolicy.required")}</p> : null}
    </>;
    case "queue": return <>
      {([ ["acceptsJobs", "Accept job requests"], ["requiresApproval", "Require staff approval"], ["requesterPicksMachine", "Let requesters choose a machine"] ] as const).map(([key, label]) =>
        <div key={key}><CheckboxField name={key} defaultChecked={type[key]} label={label} />{error(key) ? <p role="alert" className="text-caption text-danger-fg">{error(key)}</p> : null}</div>)}
      <Field label="Machine allocation" error={error("allocationPolicy")}><Dropdown name="allocationPolicy" defaultValue={type.allocationPolicy}>
        <option value="STAFF_SELECT">Staff select a machine</option><option value="FIRST_IDLE">First idle machine</option>
      </Dropdown></Field>
      <Field label="Maximum concurrent jobs" optional helperText="Leave empty for no type limit." error={error("maxConcurrentJobs")}>
        <Input name="maxConcurrentJobs" type="number" step="1" defaultValue={type.maxConcurrentJobs ?? ""} />
      </Field>
      <Field label="Maximum open jobs per requester" optional helperText="Leave empty to use the space default." error={error("maxOpenJobsPerRequester")}>
        <Input name="maxOpenJobsPerRequester" type="number" step="1" defaultValue={type.maxOpenJobsPerRequester ?? ""} />
      </Field>
    </>;
  }
}
