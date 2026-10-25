/**
 * Exact pool arithmetic for Decimal(14,3) quantities, done in integer thousandths so no float rounding ever
 * reaches the ledger. Pure and client-safe: services, views and tests share it.
 */

export const QUANTITY_SCALE = BigInt(1000);
/** Largest quantity Decimal(14,3) holds. */
export const MAX_QUANTITY = "99999999999.999";

export type Quantity = string | number | { toString(): string };

const QUANTITY_PATTERN = /^-?\d{1,11}(\.\d{1,3})?$/;

/** A quantity in thousandths. Throws on anything that isn't a plain decimal with at most three places. */
export function toMilli(value: Quantity): bigint {
  const text = typeof value === "number" ? (Number.isFinite(value) ? value.toFixed(3) : "x") : String(value).trim();
  const normalised = text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (!QUANTITY_PATTERN.test(normalised)) throw new Error("Invalid quantity.");
  const negative = normalised.startsWith("-");
  const [whole, fraction = ""] = normalised.replace("-", "").split(".");
  const milli = BigInt(whole!) * QUANTITY_SCALE + BigInt(fraction.padEnd(3, "0"));
  return negative ? -milli : milli;
}

/** Thousandths back to the shortest decimal string: BigInt(1500) → "1.5", BigInt(2000) → "2". */
export function fromMilli(value: bigint): string {
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const whole = abs / QUANTITY_SCALE;
  const fraction = (abs % QUANTITY_SCALE).toString().padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function isValidQuantity(value: unknown, options: { allowZero?: boolean; allowNegative?: boolean } = {}): boolean {
  try {
    const milli = toMilli(value as Quantity);
    if (milli === BigInt(0)) return Boolean(options.allowZero);
    return milli > BigInt(0) || Boolean(options.allowNegative);
  } catch {
    return false;
  }
}

export class InsufficientStockError extends Error {
  constructor(readonly available: string) {
    super("Not enough stock in this pool.");
  }
}

/** The balance after applying `delta`. A pool never goes below zero. */
export function nextBalance(remaining: Quantity, delta: Quantity): string {
  const next = toMilli(remaining) + toMilli(delta);
  if (next < BigInt(0)) throw new InsufficientStockError(fromMilli(toMilli(remaining)));
  return fromMilli(next);
}

export type LowStockTransition = "alert" | "clear" | "none";

/**
 * The low-stock rule (domain-behaviour §1): after a decrease that leaves the pool at or below its threshold,
 * alert once (until the flag is cleared); a change that lifts it back above the threshold clears the flag.
 * No threshold, no alerts.
 */
export function lowStockTransition(input: { before: Quantity; after: Quantity; lowThreshold: Quantity | null; alerted: boolean }): LowStockTransition {
  if (input.lowThreshold === null || input.lowThreshold === undefined || input.lowThreshold === "") return input.alerted ? "clear" : "none";
  const threshold = toMilli(input.lowThreshold);
  const before = toMilli(input.before);
  const after = toMilli(input.after);
  if (after > threshold) return input.alerted ? "clear" : "none";
  if (after < before && !input.alerted) return "alert";
  return "none";
}

/** Whether a pool's stock may be used on a machine: bound to it, bound to its type, or shared by the space. */
export function poolServesMachine(pool: { machineId: string | null; typeId: string | null }, machine: { id: string; typeId: string }) {
  if (pool.machineId) return pool.machineId === machine.id;
  if (pool.typeId) return pool.typeId === machine.typeId;
  return true;
}

/** Share of the initial quantity left, 0–100, for the remaining bar. */
export function remainingPercent(remaining: Quantity, initial: Quantity) {
  const total = toMilli(initial);
  if (total <= BigInt(0)) return 0;
  const left = toMilli(remaining);
  return Math.max(0, Math.min(100, Math.round(Number((left * BigInt(10000)) / total) / 100)));
}

export function isLowStock(remaining: Quantity, lowThreshold: Quantity | null) {
  return lowThreshold !== null && lowThreshold !== "" && toMilli(remaining) <= toMilli(lowThreshold);
}

/** "1,250.5" style display for a quantity, en-GB grouping, up to three decimals. */
export function formatQuantity(value: Quantity) {
  const text = fromMilli(toMilli(value));
  const [whole, fraction] = text.replace("-", "").split(".");
  const grouped = BigInt(whole!).toLocaleString("en-GB");
  return `${text.startsWith("-") ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}
