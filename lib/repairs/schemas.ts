import { z } from "zod";
import { parseCalendarDay } from "@/lib/calendarDay";

/** Inputs for repairs, technicians, to-buy and finance actions. Client-safe. Amounts are minor units. */
const id = z.string().trim().min(1).max(64);
const slug = z.string().trim().min(1).max(80);
const amount = z.number().int().min(0).max(2147483647);
const day = z.string().refine((value) => parseCalendarDay(value) !== null, "Choose a valid date.").optional();
export const PAYOUT_METHODS = ["CASH", "BANK_TRANSFER", "UPI", "OTHER"] as const;
export const FINANCE_METHODS = ["GATEWAY_RAZORPAY", "GATEWAY_STRIPE", "CASH", "BANK_TRANSFER", "UPI", "OTHER"] as const;
export const TECHNICIAN_CHANNELS = ["EMAIL", "WHATSAPP", "TELEGRAM"] as const;

export const technicianSchema = z.object({
  spaceSlug: slug, technicianId: id.optional(), kind: z.enum(["STAFF", "EXTERNAL"]), userId: id.nullable().optional(),
  name: z.string().max(120).default(""), email: z.string().max(320).default(""), phone: z.string().max(30).default(""),
  whatsapp: z.string().max(20).default(""), telegramChatId: z.string().max(40).default(""), skills: z.array(z.string().max(40)).max(20).default([]),
  preferredChannel: z.enum(TECHNICIAN_CHANNELS).default("EMAIL"), notes: z.string().max(1000).default(""), isActive: z.boolean().default(true),
});
export const technicianCsvSchema = z.object({ spaceSlug: slug, csv: z.string().min(1).max(50_000) });

export const sendRequestsSchema = z.object({ spaceSlug: slug, faultId: id, technicianIds: z.array(id).min(1).max(30) });
export const assignTechnicianSchema = z.object({ spaceSlug: slug, faultId: id, technicianId: id });
export const answerRequestSchema = z.object({ spaceSlug: slug, requestId: id, accept: z.boolean() });
export const revokeRequestSchema = z.object({ spaceSlug: slug, requestId: id });
export const fixSchema = z.object({ remarks: z.string().max(4000).default(""), parts: z.string().max(2000).default(""), amountAsked: amount.nullable(), fixed: z.boolean() });
export const staffFixSchema = fixSchema.extend({ spaceSlug: slug, faultId: id });
export const linkFixSchema = fixSchema.extend({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export const linkAnswerSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), accept: z.boolean() });
export const verifySchema = z.object({ spaceSlug: slug, faultId: id, approve: z.boolean(), reason: z.string().max(1000).optional() });
export const approveAmountSchema = z.object({ spaceSlug: slug, faultId: id, amount, reason: z.string().max(500).optional() });
export const payoutSchema = z.object({ spaceSlug: slug, faultId: id, amount: amount.min(1), method: z.enum(PAYOUT_METHODS),
  reference: z.string().max(200).default(""), paidOn: day, note: z.string().max(500).default("") });

export const toBuyRequestSchema = z.object({ spaceSlug: slug, kind: z.enum(["PART", "CONSUMABLE"]), title: z.string().max(160),
  quantity: z.string().regex(/^\d{1,10}(?:\.\d{1,3})?$/, "Enter a quantity"), unit: z.string().max(30).default(""), machineId: id.nullable().optional(),
  poolId: id.nullable().optional(), faultId: id.nullable().optional(), maintenanceLogId: id.nullable().optional(), note: z.string().max(1000).default("") });
export const toBuyStepSchema = z.object({ spaceSlug: slug, itemId: id, status: z.enum(["APPROVED", "CANCELLED", "RECEIVED", "BOUGHT"]),
  amount: amount.optional(), method: z.enum(PAYOUT_METHODS).optional(), reference: z.string().max(200).default(""), supplier: z.string().max(200).default(""), boughtOn: day });

export const manualEntrySchema = z.object({ spaceSlug: slug, category: z.enum(["OTHER_INCOME", "OTHER_EXPENSE", "PARTS", "CONSUMABLES", "MAINTENANCE"]),
  amount: amount.min(1), method: z.enum(FINANCE_METHODS), reference: z.string().max(200).default(""), note: z.string().trim().min(2, "Say what it was for").max(500),
  occurredOn: day, supplier: z.string().max(200).default(""), machineId: id.nullable().optional() });
export const reverseEntrySchema = z.object({ spaceSlug: slug, entryId: id, reason: z.string().trim().min(3, "Say why").max(500) });
