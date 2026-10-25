import { describe, expect, it } from "vitest";
import { depositFor, refundFor, paymentState, money } from "@/lib/payments/jobs/math";

describe("payment arithmetic in integer minor units", () => {
  it.each([
    [1000, "NONE", 500, 0], [1000, "FIXED", 1500, 1000], [1000, "FIXED", 250, 250],
    [101, "PERCENT", 5000, 51], [1, "PERCENT", 4999, 0], [100, "PERCENT", 10000, 100],
  ] as const)("deposit %s %s %s = %s", (quote, mode, value, expected) => expect(depositFor(quote, mode, value)).toBe(expected));
  it.each(["FULL", "PERCENT", "NONE", "MANUAL"] as const)("refund rule %s rounds only once", (rule) => {
    expect(refundFor(101, rule, 50)).toBe(rule === "FULL" ? 101 : rule === "PERCENT" ? 51 : 0);
  });
  it.each([-1, 1.5, NaN, Infinity, 2147483648])("rejects invalid money %s", (value) => expect(() => money(value)).toThrow());
  it("rejects invalid percentages", () => {
    expect(() => depositFor(10, "PERCENT", 10001)).toThrow();
    expect(() => refundFor(10, "PERCENT", 101)).toThrow();
  });
  it.each([
    [0, 0, 0, 0, false, "NOT_REQUIRED"], [100, 0, 0, 0, false, "QUOTED"],
    [100, 0, 0, 0, true, "PENDING"], [100, 50, 0, 0, true, "PARTIALLY_PAID"],
    [100, 100, 0, 0, false, "PAID"], [100, 0, 0, 100, false, "WAIVED"],
    [100, 50, 50, 0, false, "REFUNDED"], [100, 100, 50, 0, false, "PARTIALLY_REFUNDED"],
  ] as const)("state total %s paid %s refunded %s waived %s pending %s", (total, paid, refunded, waived, pending, expected) => {
    expect(paymentState(total, paid, refunded, waived, pending)).toBe(expected);
  });
});
