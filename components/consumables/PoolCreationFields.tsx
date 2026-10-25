"use client";

import { useState } from "react";
import { Field, Input, Dropdown } from "@/components/ui/field";
import { METERING_UNITS } from "@/lib/machines/schemas";
import { METERING_UNIT_LABELS } from "@/lib/machines/presets";
import { poolFieldError, type PoolChoices } from "./formValues";

export function PoolCreationFields({ choices, errors }: { choices: PoolChoices; errors: Record<string, string[]> }) {
  const [binding, setBinding] = useState("shared");
  const [unit, setUnit] = useState("GRAMS");
  const option = binding.startsWith("machine:") ? choices.machines.find((item) => item.id === binding.slice(8))
    : choices.types.find((item) => item.id === binding.slice(5));
  const boundUnit = binding === "shared" ? null : option?.consumableUnit;
  return <>
    <Field label="Serves" helperText="The binding and unit are fixed after creation. Create another pool to change them." error={poolFieldError(errors, "binding")}>
      <Dropdown name="binding" value={binding} onChange={(event) => setBinding(event.target.value)}>
        <option value="shared">Shared across the space</option>
        {choices.types.map((type) => <option key={type.id} value={`type:${type.id}`}>Type: {type.name}</option>)}
        {choices.machines.map((machine) => <option key={machine.id} value={`machine:${machine.id}`}>Machine: {machine.name}</option>)}
      </Dropdown>
    </Field>
    <Field label="Unit" helperText={boundUnit ? "Uses the bound machine type's consumable unit." : undefined} error={poolFieldError(errors, "unit")}>
      <Dropdown name="unit" value={boundUnit ?? unit} onChange={(event) => setUnit(event.target.value)}>
        {METERING_UNITS.filter((unit) => !boundUnit || unit === boundUnit).map((unit) => <option key={unit} value={unit}>{METERING_UNIT_LABELS[unit].label}</option>)}
      </Dropdown>
    </Field>
    <Field label="Opening quantity" helperText="Up to three decimal places. Use 0 for an empty pool." error={poolFieldError(errors, "initialQuantity")}>
      <Input name="initialQuantity" inputMode="decimal" required defaultValue="0" />
    </Field>
  </>;
}
