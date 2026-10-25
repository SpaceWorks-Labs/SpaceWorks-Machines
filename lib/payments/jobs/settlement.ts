import "server-only";
import type { Job, Payment, PaymentProvider, Prisma } from "@prisma/client";
import { JobGuardError } from "@/lib/jobs/context";
import type { GatewayEvent } from "../gateway";
import { proposeOutcomeRefund, proposeOverpayment } from "../refundProposals";
import { lockPayment } from "./context";
import { financeMethodOf, postFinance } from "@/lib/finance/post";
import { paymentNotice } from "./notifications";
import { terminalJob, updatePaymentState } from "./state";

export async function paidPayment(tx: Prisma.TransactionClient, job: Job, payment: Payment, providerPaymentId?: string | null) {
  if (payment.status === "PAID") return [];
  const updated = await tx.payment.update({ where: { id: payment.id }, data: { status: "PAID", paidAt: new Date(),
    ...(providerPaymentId ? { providerPaymentId } : {}) } });
  await updatePaymentState(tx, job);
  // The ledger entry posts with the payment, once (a replayed settlement finds it already there).
  const posted = await postFinance(tx, { spaceId: job.spaceId, direction: "IN", category: "JOB_PAYMENT", amountMinor: updated.amount, currency: updated.currency,
    method: financeMethodOf(updated.method), reference: updated.reference || updated.providerPaymentId || "", occurredAt: updated.paidAt ?? new Date(),
    sourceType: "Payment", sourceId: updated.id, actorId: updated.confirmedById ?? updated.recordedById, note: `Job ${job.number}`,
    machineId: job.assignedMachineId ?? job.machineId, typeId: job.typeId });
  if (terminalJob(job)) await proposeOutcomeRefund(tx, job, job.status === "REJECTED" ? "rejected" : job.status === "CANCELLED" ? "cancelled" : "failed");
  else await proposeOverpayment(tx, job);
  return [...await paymentNotice(tx, job, updated, "paid", payment.amount), ...posted.webhookDeliveryIds];
}

/** Amount/currency and both identifiers must agree; a valid signature alone is not settlement. */
export async function settleCapture(tx: Prisma.TransactionClient, spaceId: string, provider: PaymentProvider, event: Extract<GatewayEvent, { type: "captured" | "failed" }>) {
  const found = await tx.payment.findFirst({ where: { spaceId, method: provider === "OFFLINE" ? undefined : provider,
    OR: [...(event.paymentId ? [{ id: event.paymentId }] : []), ...(event.orderId ? [{ providerOrderId: event.orderId }] : [])] } });
  if (!found) return null;
  const { job, payment } = await lockPayment(tx, spaceId, found.id);
  if (event.paymentId && event.paymentId !== payment.id) throw new JobGuardError("Payment reference does not match.");
  if (event.orderId && payment.providerOrderId && event.orderId !== payment.providerOrderId && !(provider === "RAZORPAY" && event.paymentId === payment.id)) {
    // A failed/expired old Stripe session cannot invalidate its replacement.
    if (event.type === "failed") return [];
    throw new JobGuardError("Checkout reference does not match.");
  }
  if (event.type === "captured") {
    if (event.amountMinor !== payment.amount || event.currency !== payment.currency || !event.gatewayPaymentId) throw new JobGuardError("Payment amount or currency does not match.");
    if (payment.status === "PAID" && payment.providerPaymentId !== event.gatewayPaymentId) throw new JobGuardError("A second capture needs reconciliation.");
    return paidPayment(tx, job, payment, event.gatewayPaymentId);
  }
  if (["PAID", "WAIVED", "CANCELLED"].includes(payment.status)) return [];
  // Stripe failure events describe terminal sessions; Razorpay payment failures leave the link payable.
  const terminalCheckout = provider === "STRIPE";
  await tx.payment.update({ where: { id: payment.id }, data: { status: "FAILED", note: event.reason.slice(0, 2000),
    ...(terminalCheckout ? { checkoutUrl: null, checkoutExpiresAt: new Date(0), checkoutKey: null, checkoutStartedAt: null } : {}) } });
  await updatePaymentState(tx, job);
  return [];
}
