import type { PricingMode } from "@prisma/client";

export class PricingInputError extends Error {}

export type PriceRule = { mode: PricingMode; flatFee?: number; timeRatePerHour?: number;
  materialRate?: string | number | { toString(): string }; setupFee?: number; minimumCharge?: number; timeIncrementMinutes?: number };
export type PriceInputs = { minutes?: number | null; quantity?: string | number | { toString(): string } | null;
  taxRateBps?: number; taxInclusive?: boolean; taxLabel?: string };
export type PricingSnapshot = { lines: { label: string; amount: number }[]; subtotal: number; tax: number; total: number;
  billableMinutes: number; taxRateBps: number; taxInclusive: boolean; taxLabel: string };

const SCALE = BigInt(600000000); // exact common denominator: hourly rates and 4dp rates × 3dp quantities
function decimal(value: string | number | { toString(): string }, places: number) {
  const text = String(value);
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(text)) throw new PricingInputError("Invalid non-negative decimal.");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * BigInt(10 ** places) + BigInt(fraction.padEnd(places, "0"));
}
function integer(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new PricingInputError("Expected a non-negative integer.");
  return value;
}
function round(n: bigint, d: bigint) { return (n * BigInt(2) + d) / (BigInt(2) * d); }
function money(n: bigint) {
  if (n > BigInt(2147483647)) throw new PricingInputError("Price exceeds the supported amount.");
  return Number(n);
}

/** All intermediate amounts are exact rationals. Only the final subtotal and tax are rounded half-up. */
export function calculatePrice(rule: PriceRule | null, input: PriceInputs = {}): PricingSnapshot {
  const bps = integer(input.taxRateBps ?? 0);
  const inclusive = input.taxInclusive ?? true;
  const result: PricingSnapshot = { lines: [], subtotal: 0, tax: 0, total: 0, billableMinutes: 0,
    taxRateBps: bps, taxInclusive: inclusive, taxLabel: input.taxLabel ?? "Tax" };
  if (!rule || rule.mode === "FREE") return result;
  const lines: { label: string; scaled: bigint }[] = [];
  const add = (label: string, scaled: bigint) => { lines.push({ label, scaled }); };
  if (rule.mode === "FLAT") add("Job", BigInt(integer(rule.flatFee ?? 0)) * SCALE);
  else {
    add("Setup", BigInt(integer(rule.setupFee ?? 0)) * SCALE);
    if (rule.mode === "TIME" || rule.mode === "TIME_AND_MATERIAL") {
      if (input.minutes == null) throw new PricingInputError("A time estimate or actual time is required.");
      const minutes = integer(input.minutes);
      const increment = integer(rule.timeIncrementMinutes ?? 1);
      if (!increment) throw new PricingInputError("Time increment must be positive.");
      result.billableMinutes = integer(Math.ceil(minutes / increment) * increment);
      add("Machine time", BigInt(integer(rule.timeRatePerHour ?? 0)) * BigInt(result.billableMinutes) * SCALE / BigInt(60));
    }
    if (rule.mode === "MATERIAL" || rule.mode === "TIME_AND_MATERIAL") {
      if (input.quantity == null) throw new PricingInputError("A material estimate or actual quantity is required.");
      add("Material", decimal(rule.materialRate ?? 0, 4) * decimal(input.quantity, 3) * (SCALE / BigInt(10000000)));
    }
  }
  let scaled = lines.reduce((total, line) => total + line.scaled, BigInt(0));
  const minimum = BigInt(integer(rule.minimumCharge ?? 0)) * SCALE;
  if (scaled < minimum) { add("Minimum charge adjustment", minimum - scaled); scaled = minimum; }
  result.lines = lines.map((line) => ({ label: line.label, amount: Number(line.scaled) / Number(SCALE) }));
  const base = round(scaled, SCALE);
  const tax = round(base * BigInt(bps), BigInt(inclusive ? 10000 + bps : 10000));
  result.tax = money(tax);
  result.subtotal = money(inclusive ? base - tax : base);
  result.total = money(inclusive ? base : base + tax);
  return result;
}
