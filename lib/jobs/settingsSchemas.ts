import { z } from "zod";
import { id } from "./actionSchemas";

const boolean = z.boolean();
const amount = z.number().int().min(0).max(2147483647);
const refund = z.enum(["FULL", "PERCENT", "NONE", "MANUAL"]);
const percent = z.number().int().min(0).max(100);
export const timing = z.enum(["UPFRONT", "ON_COMPLETION", "PAY_LATER"]);
const notifications = z.object({ submitted: boolean, approved: boolean, rejected: boolean, started: boolean,
  completed: boolean, failed: boolean, cancelled: boolean, payment: boolean, refund: boolean }).partial();
export const jobSettingsSchema = z.object({
  jobsEnabled: boolean, eligibility: z.enum(["ANYONE", "MEMBERS_ONLY", "STAFF_ONLY"]),
  maxOpenJobsPerRequester: z.number().int().min(1).max(10000), allowRequesterCancel: boolean,
  refundOnFailure: refund, refundOnFailurePercent: percent, refundOnCancel: refund, refundOnCancelPercent: percent,
  refundOnReject: refund, refundOnRejectPercent: percent, requesterEmails: notifications,
  staffAlerts: z.object({ submitted: boolean, cancelled: boolean, failed: boolean, payment: boolean }).partial(),
});
export const moneySettingsSchema = z.object({
  paymentsEnabled: boolean, defaultPaymentTiming: timing, allowPayLater: boolean, requirePaymentBeforeCollection: boolean,
  publicUsesMemberRates: boolean, taxRateBps: z.number().int().min(0).max(10000), taxInclusive: boolean,
  taxLabel: z.string().trim().min(1).max(40), onlineMethods: z.array(z.enum(["RAZORPAY", "STRIPE"])).max(2),
  offlineMethods: z.array(z.enum(["CASH", "UPI", "BANK_TRANSFER", "CARD_TERMINAL", "OTHER"])).max(5),
}).refine((v) => v.allowPayLater || v.defaultPaymentTiming !== "PAY_LATER", { message: "Enable pay later before choosing it as the default", path: ["defaultPaymentTiming"] });
export const pricingRuleSchema = z.object({
  ruleId: id.optional(), typeId: id.nullable(), machineId: id.nullable(), audience: z.enum(["MEMBER", "PUBLIC"]),
  mode: z.enum(["FREE", "FLAT", "TIME", "MATERIAL", "TIME_AND_MATERIAL"]),
  flatFee: amount, timeRatePerHour: amount, setupFee: amount, minimumCharge: amount,
  materialRate: z.string().regex(/^\d{1,10}(?:\.\d{1,4})?$/), timeIncrementMinutes: z.number().int().min(1).max(1440),
  depositMode: z.enum(["NONE", "FIXED", "PERCENT"]), depositValue: amount, paymentTiming: timing.nullable(),
}).refine((v) => v.depositMode !== "PERCENT" || v.depositValue <= 10000, { message: "Use a deposit of at most 100%", path: ["depositValue"] })
  .refine((v) => !v.typeId || !v.machineId, { message: "Choose either a type or a machine", path: ["machineId"] });
