import { describe, expect, it } from "vitest";
import { calculatePrice, resolvePricingRule, type PriceRule } from "@/lib/pricing";

const scope = { spaceId: "space", typeId: "type", machineId: "machine", audience: "MEMBER" as "MEMBER" | "PUBLIC", paymentsEnabled: true, publicUsesMemberRates: false };
const rule = (id: string, audience: "MEMBER" | "PUBLIC" = "MEMBER", typeId: string | null = null, machineId: string | null = null) => ({ id, spaceId: "space", typeId, machineId, audience });

describe("pricing resolution", () => {
  it("chooses machine, then type, then space; never another tenant or machine", () => {
    const defaults = rule("space"); const type = rule("type", "MEMBER", "type"); const machine = rule("machine", "MEMBER", "type", "machine");
    const foreign = { ...machine, id: "foreign", spaceId: "away" };
    expect(resolvePricingRule([foreign, defaults, type, machine], scope)).toBe(machine);
    expect(resolvePricingRule([defaults, type], scope)).toBe(type);
    expect(resolvePricingRule([defaults, { ...machine, machineId: "other" }], scope)).toBe(defaults);
    expect(resolvePricingRule([foreign], scope)).toBeNull();
  });
  it("looks at every PUBLIC level before any MEMBER fallback", () => {
    const member = rule("member-machine", "MEMBER", "type", "machine"); const publicRule = rule("public-space", "PUBLIC");
    expect(resolvePricingRule([member, publicRule], { ...scope, audience: "PUBLIC", publicUsesMemberRates: true })).toBe(publicRule);
    expect(resolvePricingRule([member], { ...scope, audience: "PUBLIC", publicUsesMemberRates: true })).toBe(member);
    expect(() => resolvePricingRule([member], { ...scope, audience: "PUBLIC" })).toThrow("not offered to the public");
  });
  it("forces FREE with payments off, and defaults to FREE when no applicable rule exists", () => {
    expect(resolvePricingRule([rule("member")], { ...scope, paymentsEnabled: false, audience: "PUBLIC" })).toBeNull();
    expect(resolvePricingRule([], scope)).toBeNull();
    expect(resolvePricingRule([], { ...scope, audience: "PUBLIC" })).toBeNull();
  });
});

describe("exact pricing arithmetic", () => {
  const common = { flatFee: 1000, setupFee: 100, minimumCharge: 0, timeRatePerHour: 600, materialRate: "2.5", timeIncrementMinutes: 15 };
  it.each([
    ["FREE", 0], ["FLAT", 1000], ["TIME", 400], ["MATERIAL", 125], ["TIME_AND_MATERIAL", 425],
  ] as const)("prices %s", (mode, total) => {
    expect(calculatePrice({ ...common, mode }, { minutes: 16, quantity: "10" })).toMatchObject({ total, tax: 0, subtotal: total });
  });
  it("FREE ignores fees, minimum, absent estimates and tax", () => {
    expect(calculatePrice({ ...common, mode: "FREE", minimumCharge: 5000 }, { taxRateBps: 1800 })).toMatchObject({ lines: [], total: 0 });
    expect(calculatePrice(null).total).toBe(0);
  });
  it.each(["FLAT", "TIME", "MATERIAL", "TIME_AND_MATERIAL"] as const)("applies the minimum to %s", (mode) => {
    expect(calculatePrice({ ...common, mode, minimumCharge: 10000 }, { minutes: 0, quantity: "0" }).total).toBe(10000);
  });
  it.each([[0, 0], [1, 15], [15, 15], [16, 30], [60, 60]])("rounds %i minutes up to %i billable minutes", (minutes, billableMinutes) => {
    expect(calculatePrice({ ...common, mode: "TIME" }, { minutes }).billableMinutes).toBe(billableMinutes);
  });
  it("rounds half-up only after adding exact time and material, including sub-paise rates", () => {
    const r: PriceRule = { mode: "TIME_AND_MATERIAL", timeRatePerHour: 15, materialRate: "0.25" };
    expect(calculatePrice(r, { minutes: 1, quantity: "1" }).total).toBe(1); // .25 + .25, not rounded line by line
    expect(calculatePrice({ mode: "MATERIAL", materialRate: "0.0001" }, { quantity: "5000" }).total).toBe(1);
    expect(calculatePrice({ mode: "MATERIAL", materialRate: "0.0001" }, { quantity: "4999.999" }).total).toBe(0);
    expect(calculatePrice({ mode: "TIME", timeRatePerHour: 1 }, { minutes: 30 }).total).toBe(1);
    expect(calculatePrice({ mode: "TIME", timeRatePerHour: 1 }, { minutes: 29 }).total).toBe(0);
  });
  it("extracts inclusive tax without changing the total", () => {
    expect(calculatePrice({ mode: "FLAT", flatFee: 11800 }, { taxRateBps: 1800, taxInclusive: true })).toMatchObject({ subtotal: 10000, tax: 1800, total: 11800 });
  });
  it("adds exclusive tax after rounding the subtotal", () => {
    expect(calculatePrice({ mode: "FLAT", flatFee: 10000 }, { taxRateBps: 1800, taxInclusive: false })).toMatchObject({ subtotal: 10000, tax: 1800, total: 11800 });
    expect(calculatePrice({ mode: "FLAT", flatFee: 1 }, { taxRateBps: 5000, taxInclusive: false })).toMatchObject({ subtotal: 1, tax: 1, total: 2 });
  });
  it.each(["FREE", "FLAT", "TIME", "MATERIAL", "TIME_AND_MATERIAL"] as const)("keeps totals consistent for inclusive and exclusive tax in %s", (mode) => {
    const untaxed = calculatePrice({ ...common, mode }, { minutes: 16, quantity: "10" });
    for (const taxInclusive of [true, false]) {
      const result = calculatePrice({ ...common, mode }, { minutes: 16, quantity: "10", taxRateBps: 1800, taxInclusive });
      expect(result.subtotal + result.tax).toBe(result.total);
      expect(taxInclusive ? result.total : result.subtotal).toBe(untaxed.total);
    }
  });
  it.each(["TIME", "MATERIAL", "TIME_AND_MATERIAL"] as const)("requires the inputs for %s", (mode) => {
    expect(() => calculatePrice({ mode })).toThrow("required");
  });
  it("rejects invalid increments, values, precision and amounts beyond database range", () => {
    expect(() => calculatePrice({ mode: "TIME", timeIncrementMinutes: 0 }, { minutes: 10 })).toThrow("increment");
    expect(() => calculatePrice({ mode: "TIME" }, { minutes: -1 })).toThrow();
    expect(() => calculatePrice({ mode: "TIME" }, { minutes: 1.5 })).toThrow();
    expect(() => calculatePrice({ mode: "MATERIAL", materialRate: "0.00001" }, { quantity: "1" })).toThrow();
    expect(() => calculatePrice({ mode: "MATERIAL" }, { quantity: "1.0001" })).toThrow();
    expect(() => calculatePrice({ mode: "FLAT", flatFee: 2147483648 })).toThrow("supported");
  });
});
