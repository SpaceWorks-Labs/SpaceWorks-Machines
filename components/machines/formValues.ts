import type { FieldDefinition } from "@/lib/machines/fields";
import type { MachineDetailsInput } from "./types";

/** Send only defined spec keys; the domain keeps historical keys on update. Blank specs never block saving. */
export function readMachineForm(form: FormData, fields: readonly FieldDefinition[]): MachineDetailsInput {
  const text = (name: string) => String(form.get(name) ?? "");
  const specs = Object.fromEntries(fields.map((field) => {
    const name = `specs.${field.key}`;
    if (field.kind === "multiselect") return [field.key, form.getAll(name).map(String)];
    if (field.kind === "dimensions") return [field.key, { x: text(`${name}.x`), y: text(`${name}.y`), z: text(`${name}.z`) }];
    return [field.key, text(name)];
  }));
  return {
    name: text("name"), manufacturer: text("manufacturer"), model: text("model"), serialNumber: text("serialNumber"),
    location: text("location"), description: text("description"), notes: text("notes"), firmwareVersion: text("firmwareVersion"),
    acquiredOn: text("acquiredOn") || null, purchaseCost: text("purchaseCost"), specs,
  };
}
