import { z } from "zod";

export const id = z.string().trim().min(1).max(128);
const text = z.string().trim().max(2000);
const reason = text.min(1, "Give a reason");
const whole = z.number().int().min(0).max(2147483647);
const quantity = z.string().regex(/^\d{1,11}(?:\.\d{1,3})?$/, "Enter a non-negative quantity with up to three decimal places");
export const submitSchema = z.object({
  typeId: id, machineId: id.optional(), requesterEmail: z.email().max(254).optional(),
  title: z.string().trim().min(1).max(200), description: z.string().max(10000).optional(),
  sourceLink: z.union([z.literal(""), z.url().max(2048).refine((v) => /^https?:\/\//.test(v), "Use an HTTP or HTTPS link")]).optional(),
  requestData: z.record(z.string().max(40), z.unknown()).optional(), quantity: whole.min(1).default(1),
});
export const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approve"), estimatedMinutes: whole.optional(), estimatedQuantity: quantity.optional(), note: text.optional(), priceOverride: whole.optional(), reason: reason.optional() }),
  z.object({ kind: z.literal("reject"), reason }),
  z.object({ kind: z.literal("cancel"), reason: text.optional() }),
  z.object({ kind: z.literal("start"), machineId: id.optional(), poolId: id.optional(), plannedQuantity: quantity.optional(), paymentOverrideReason: reason.optional() }),
  z.object({ kind: z.literal("pause") }), z.object({ kind: z.literal("resume") }),
  z.object({ kind: z.literal("complete"), actualMinutes: whole, actualQuantity: quantity.optional() }),
  z.object({ kind: z.literal("fail"), reason, percent: whole.max(100), actualMinutes: whole, actualQuantity: quantity.optional() }),
  z.object({ kind: z.literal("collect"), paymentOverrideReason: reason.optional() }),
  z.object({ kind: z.literal("reprint") }), z.object({ kind: z.literal("priority"), priority: whole }),
  z.object({ kind: z.literal("reassign"), machineId: id.nullable() }),
  z.object({ kind: z.literal("note"), body: reason, internal: z.boolean().optional() }),
]);
export const transitionSchema = z.object({ jobId: id, command: commandSchema });
