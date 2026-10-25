"use server";

import { z } from "zod";
import { invalid, slugOf, staffAction } from "@/lib/actionAccess";
import { id } from "@/lib/jobs/actionSchemas";
import { jobFailure, refreshJobs, requesterAction } from "@/lib/jobs/actionSupport";
import { createJobCheckout } from "@/lib/payments/jobs/checkout";
import { recordOfflinePayment, confirmOfflinePayment, waivePayment } from "@/lib/payments/jobs/offline";
import { createRefund, processRefund, handBackRefund } from "@/lib/payments/refunds";
import { prisma } from "@/lib/db";
import { GatewayError } from "@/lib/payments/gateway";
import type { ActionResult } from "./space";

const base = z.object({ paymentId: id });
const reason = z.string().trim().min(1).max(2000);
export async function payNowAction(input: unknown): Promise<ActionResult<{ url: string }>> {
  const access = await requesterAction(input);
  if (!access.ok) return access;
  const parsed = base.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const payment = await createJobCheckout({ spaceId: access.space.id, actorId: access.userId, ...parsed.data });
    refreshJobs(access.space.slug);
    if (!payment.checkoutUrl) return { ok: false, error: "This payment has already been settled." };
    return { ok: true, data: { url: payment.checkoutUrl } };
  } catch (error) {
    if (error instanceof GatewayError) return { ok: false, error: "The payment provider could not be reached. Try again shortly." };
    return jobFailure(error);
  }
}

const paymentCommand = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("record"), method: z.enum(["CASH", "UPI", "BANK_TRANSFER", "CARD_TERMINAL", "OTHER"]), reference: reason, note: z.string().max(2000).optional() }),
  z.object({ kind: z.literal("confirm") }), z.object({ kind: z.literal("waive"), reason }),
  z.object({ kind: z.literal("refund"), amount: z.number().int().positive().max(2147483647).optional(), reason }),
  z.object({ kind: z.literal("processRefund"), refundId: id, reference: reason.optional() }),
]);
export async function jobPaymentAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "payments.manage");
  if (!access.ok) return access;
  const parsed = base.extend({ command: paymentCommand }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const context = { spaceId: access.space.id, actorId: access.userId, paymentId: parsed.data.paymentId };
  const command = parsed.data.command;
  try {
    if (command.kind === "record") await recordOfflinePayment(context, command);
    if (command.kind === "confirm") await confirmOfflinePayment(context);
    if (command.kind === "waive") await waivePayment(context, command.reason);
    if (command.kind === "refund") await createRefund(context, { amount: command.amount, reason: "OTHER", note: command.reason });
    if (command.kind === "processRefund") {
      const refund = await prisma.refund.findFirst({ where: { spaceId: context.spaceId, id: command.refundId, paymentId: context.paymentId }, include: { payment: { select: { method: true } } } });
      if (!refund) return { ok: false, error: "Space not found." };
      const refundContext = { spaceId: context.spaceId, actorId: context.actorId, refundId: refund.id };
      const result = ["RAZORPAY", "STRIPE"].includes(refund.payment.method ?? "") ? await processRefund(refundContext) : await handBackRefund(refundContext, command.reference ?? "");
      if (result.status !== "SUCCEEDED") { refreshJobs(access.space.slug); return { ok: false, error: result.failureReason || "The refund is pending with the provider. Check again later." }; }
    }
    refreshJobs(access.space.slug);
    return { ok: true };
  } catch (error) { return jobFailure(error); }
}
