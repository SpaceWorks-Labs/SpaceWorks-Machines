import { currencyExponent, type CurrencyCode } from "@/lib/money/currencies";

/** Material rates retain four decimal places in minor units, without floating point multiplication. */
export function parseMaterialRate(major: string, currency: CurrencyCode): string | null {
  const exponent = currencyExponent(currency);
  const match = /^(\d{1,12})(?:\.(\d+))?$/.exec(major.trim());
  if (!match || (match[2]?.length ?? 0) > exponent + 4) return null;
  const scaled = BigInt(match[1]) * BigInt(10 ** (exponent + 4)) + BigInt((match[2] ?? "").padEnd(exponent + 4, "0"));
  const whole = scaled / BigInt(10000);
  if (whole > BigInt(9999999999)) return null;
  return `${whole}.${String(scaled % BigInt(10000)).padStart(4, "0")}`;
}
export function materialRateInput(minor: string, currency: CurrencyCode) {
  const [whole, fraction = ""] = minor.split(".");
  const scaled = BigInt(whole) * BigInt(10000) + BigInt(fraction.padEnd(4, "0"));
  const places = currencyExponent(currency) + 4;
  const divisor = BigInt(10 ** places);
  return `${scaled / divisor}.${String(scaled % divisor).padStart(places, "0")}`.replace(/\.?0+$/, "") || "0";
}
