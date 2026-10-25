import { describe, expect, it } from "vitest";
import { readTypeSection, sectionError } from "@/components/machine-settings/formValues";
import { fieldDraft, fieldValue } from "@/components/machine-settings/fieldDrafts";
import { readPoolCreation, readPoolDetails } from "@/components/consumables/formValues";
import { typeSectionSchema, createPoolSchema } from "@/lib/machines/schemas";
import { formatQuantity } from "@/lib/consumables/math";
import { MB } from "@/lib/machines/filePolicy";

function data(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("machine settings forms", () => {
  it("distinguishes blank job limits from invalid zero overrides", () => {
    const values = readTypeSection("queue", data({ allocationPolicy: "FIRST_IDLE", maxConcurrentJobs: "0", acceptsJobs: "on" }));
    expect(values).toMatchObject({ acceptsJobs: true, requiresApproval: false, requesterPicksMachine: false, maxConcurrentJobs: 0, maxOpenJobsPerRequester: null });
    expect(typeSectionSchema.safeParse({ section: "queue", values }).success).toBe(false);
  });
  it("keeps file policy size precise and accepts a zero-file policy", () => {
    const values = readTypeSection("filePolicy", data({ extensions: ".STL, 3mf\npdf", maxMB: "0.5", maxFiles: "0" }));
    expect(values).toEqual({ filePolicy: { extensions: [".STL", "3mf", "pdf"], maxBytes: MB / 2, maxFiles: 0, required: false } });
    expect(typeSectionSchema.safeParse({ section: "filePolicy", values }).success).toBe(true);
  });
  it("round-trips definitions including false, zero bounds, help and ordered options", () => {
    const field = { key: "power", label: "Power", kind: "number" as const, min: 0, max: 100, unit: "W", help: "At the tool", required: false, public: true };
    expect(fieldValue(fieldDraft(field, "one"))).toEqual(field);
    const pick = { ...fieldDraft({ key: "mode", label: "Mode", kind: "select" }, "two"), options: "Cut\n\n Engrave " };
    expect(fieldValue(pick).options).toEqual(["Cut", "Engrave"]);
  });
  it("maps nested errors without confusing similarly named paths", () => {
    expect(sectionError({ "values.filePolicy.extensions.0": ["Invalid extension"], "values.filePolicy.maxFiles": ["Too many"], "values.filePolicyOther": ["Other"] }, "filePolicy")).toBe("Invalid extension Too many");
  });
});

describe("pool form values", () => {
  it("retains the largest precise quantity and zero threshold as decimal strings", () => {
    const values = readPoolCreation(data({ material: "PLA", unit: "GRAMS", initialQuantity: "99999999999.999", lowThreshold: "0", costPerUnit: "1.250", binding: "machine:machine-1", isPublic: "on" }));
    expect(values).toMatchObject({ initialQuantity: "99999999999.999", lowThreshold: "0", costPerUnit: "1.250", binding: { kind: "machine", machineId: "machine-1" } });
    expect(createPoolSchema.safeParse(values).success).toBe(true);
    expect(formatQuantity(values.initialQuantity)).toBe("99,999,999,999.999");
    expect(formatQuantity("-0.001")).toBe("-0.001");
  });
  it("uses null for no threshold and supports each binding", () => {
    expect(readPoolDetails(data({ material: "PLA" }))).toMatchObject({ lowThreshold: null, isPublic: false });
    expect(readPoolCreation(data({ binding: "type:type-1" })).binding).toEqual({ kind: "type", typeId: "type-1" });
    expect(readPoolCreation(data({ binding: "shared" })).binding).toEqual({ kind: "shared" });
  });
});
