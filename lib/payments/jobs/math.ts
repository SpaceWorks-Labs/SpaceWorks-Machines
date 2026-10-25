import type { DepositMode, JobPaymentState, RefundRule } from "@prisma/client";

export function money(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new Error("Enter an integer amount in minor units.");
  return value;
}

export function depositFor(quote: number, mode: DepositMode, value: number) {
  money(quote); money(value);
  if (mode === "PERCENT" && value > 10000) throw new Error("Deposit percentage must be between 0 and 100%.");
  return Math.min(quote, mode === "FIXED" ? value : mode === "PERCENT" ? Math.floor((quote * value + 5000) / 10000) : 0);
}

export function refundFor(paid: number, rule: RefundRule, percent: number) {
  money(paid);
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new Error("Refund percentage must be between 0 and 100.");
  return rule === "FULL" ? paid : rule === "PERCENT" ? Math.floor((paid * percent + 50) / 100) : 0;
}

export function paymentState(total: number, paid: number, refunded: number, waived: number, pending: boolean): JobPaymentState {
  if (refunded > 0) return refunded === paid ? "REFUNDED" : "PARTIALLY_REFUNDED";
  if (total === 0 && paid === 0) return "NOT_REQUIRED";
  if (paid >= total) return "PAID";
  if (paid + waived >= total) return "WAIVED";
  if (paid > 0) return "PARTIALLY_PAID";
  return pending ? "PENDING" : "QUOTED";
}
