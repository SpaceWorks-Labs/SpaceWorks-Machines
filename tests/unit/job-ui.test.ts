import { describe, expect, it } from "vitest";
import { commandValues, requestValues } from "@/components/jobs/formValues";
import { csvCell, duration, jobNumber, queueLabel, remainingMinutes } from "@/lib/jobs/presentation";
import { materialRateInput, parseMaterialRate } from "@/lib/jobs/pricingForm";
import { commandSchema, submitSchema } from "@/lib/jobs/actionSchemas";
import { JOB_DEFAULTS } from "@/lib/jobs/settingsDefaults";
import { jobSettingsSchema, moneySettingsSchema } from "@/lib/jobs/settingsSchemas";

describe("job forms and presentation", () => {
  it("reads multi-select and dimensional requests without flattening them", () => {
    const f = new FormData();
    f.set("title", "Bracket"); f.set("quantity", "2"); f.append("request.finish", "Matte"); f.append("request.finish", "Smooth");
    f.set("request.size.x", "10"); f.set("request.size.y", "20"); f.set("request.enabled", "false");
    const values = requestValues(f, [{ key: "finish", label: "Finish", kind: "multiselect" }, { key: "size", label: "Size", kind: "dimensions" }, { key: "enabled", label: "Enabled", kind: "boolean" }]);
    expect(values).toMatchObject({ title: "Bracket", quantity: 2, requestData: { finish: ["Matte", "Smooth"], size: { x: "10", y: "20", z: "" }, enabled: "false" } });
  });
  it("preserves explicit zero estimates, clearing an assignment and internal notes", () => {
    const f = new FormData(); f.set("estimatedMinutes", "0"); f.set("priceOverride", "12.50");
    expect(commandValues("approve", f, "INR")).toMatchObject({ estimatedMinutes: 0, priceOverride: 1250 });
    expect(commandValues("reassign", new FormData(), "INR")).toEqual({ kind: "reassign", machineId: null });
    f.set("internal", "on"); f.set("body", " Staff note ");
    expect(commandValues("note", f, "INR")).toMatchObject({ body: "Staff note", internal: true });
  });
  it("rejects unsafe links, missing reasons and fractional run minutes", () => {
    expect(submitSchema.safeParse({ title: "Part", typeId: "type", sourceLink: "javascript:alert(1)" }).success).toBe(false);
    expect(commandSchema.safeParse({ kind: "reject", reason: " " }).success).toBe(false);
    expect(commandSchema.safeParse({ kind: "complete", actualMinutes: 1.5 }).success).toBe(false);
  });
  it("formats queue estimates and running time without negative durations", () => {
    expect(queueLabel({ position: 3, approvedAhead: 2, awaitingReviewAhead: 0, etaMinutes: 80 })).toBe("#3 in the queue · 2 approved jobs ahead · about 1 h 20 min");
    expect(queueLabel(null)).toBe(""); expect(duration(60)).toBe("1 h"); expect(duration(0)).toBe("0 min");
    expect(jobNumber(42)).toBe("J-0042");
    expect(remainingMinutes({ status: "RUNNING", startedAt: "2026-01-01T00:00:00Z", estimatedMinutes: 10 }, new Date("2026-01-01T01:00:00Z"))).toBe(0);
    expect(remainingMinutes({ status: "PAUSED", startedAt: new Date(), estimatedMinutes: 10 })).toBeNull();
  });
  it.each(["=SUM(1,2)", "+cmd", "@query", " -2"])("escapes formula-like CSV cells: %s", (value) => expect(csvCell(value)).toBe(`"'${value}"`));
  it("quotes commas, newlines and quote characters in CSV", () => expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"'));
  it.each(["INR", "JPY", "OMR"] as const)("round trips sub-minor material rates for %s", (currency) => {
    for (const minor of ["0", "0.0001", "12.1234", "999999.0001"]) expect(Number(parseMaterialRate(materialRateInput(minor, currency), currency))).toBe(Number(minor));
    expect(parseMaterialRate("-1", currency)).toBeNull();
  });
  it("keeps money switches out of machine settings and validates pay-later configuration", () => {
    expect(jobSettingsSchema.parse({ ...JOB_DEFAULTS, paymentsEnabled: true })).not.toHaveProperty("paymentsEnabled");
    expect(moneySettingsSchema.safeParse({ ...JOB_DEFAULTS, allowPayLater: false, defaultPaymentTiming: "PAY_LATER" }).success).toBe(false);
  });
});
