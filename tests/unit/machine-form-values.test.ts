import { describe, expect, it } from "vitest";
import { readMachineForm } from "@/components/machines/formValues";
import { validateSpecs, type FieldDefinition } from "@/lib/machines/fields";

const fields: FieldDefinition[] = [
  { key: "power", label: "Power", kind: "number", required: true },
  { key: "description", label: "Description", kind: "text" },
  { key: "firmware", label: "Firmware", kind: "select", options: ["Marlin", "Klipper"] },
  { key: "nozzles", label: "Nozzles", kind: "multiselect", options: ["0.4", "0.6"] },
  { key: "enclosed", label: "Enclosed", kind: "boolean", required: true },
  { key: "bed", label: "Bed", kind: "dimensions" },
  { key: "material", label: "Material", kind: "material" },
  { key: "colour", label: "Colour", kind: "colour" },
];

describe("machine form submission", () => {
  it("round-trips every field kind through domain coercion, including zero and false", () => {
    const form = new FormData();
    Object.entries({ name: "Printer", "specs.power": "0", "specs.description": "Direct drive", "specs.firmware": "Klipper",
      "specs.enclosed": "false", "specs.bed.x": "220", "specs.bed.y": "220", "specs.bed.z": "250", "specs.material": "PLA", "specs.colour": "Grey" })
      .forEach(([key, value]) => form.set(key, value));
    form.append("specs.nozzles", "0.4");
    form.append("specs.nozzles", "0.6");
    form.set("specs.hidden", "Do not submit historical keys");
    const details = readMachineForm(form, fields);
    expect(details.name).toBe("Printer");
    expect(details.acquiredOn).toBeNull();
    expect(details.specs).not.toHaveProperty("hidden");
    const result = validateSpecs(fields, details.specs);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.values).toEqual({ power: 0, description: "Direct drive", firmware: "Klipper", nozzles: ["0.4", "0.6"], enclosed: false,
      bed: { x: 220, y: 220, z: 250 }, material: "PLA", colour: "Grey" });
  });

  it("allows empty required specs and cleared optional dimensions while keeping historical keys on the server", () => {
    const details = readMachineForm(new FormData(), fields);
    const result = validateSpecs(fields, details.specs, { retired_field: "Historical value", bed: { x: 1, y: 1 } });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual(["power", "enclosed"]);
    expect(result.values).toEqual({ retired_field: "Historical value" });
  });
});
