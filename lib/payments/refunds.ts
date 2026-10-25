import "server-only";
import type { RefundReason } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { JobGuardError, JobNotFoundError, requireReason } from "@/lib/jobs/context";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import { GatewayError } from "./gateway";
import { lockPayment, moneyAccess, type PaymentContext } from "./jobs/context";
import { jobGateway, type GatewayClients } from "./jobs/clients";
import { money } from "./jobs/math";
import { succeedRefund } from "./refundSettlement";

export { proposeOutcomeRefund, proposeOverpayment } from "./refundProposals";

/** Full means the unreserved remainder; pending proposals count against the cap. */
export async function createRefund(context: PaymentContext, input: { amount?: number; reason: RefundReason; note: string }) {
  return prisma.$transaction(async (tx) => {
    const { payment } = await lockPayment(tx, context.spaceId, context.paymentId);
    await moneyAccess(tx, context.spaceId, context.actorId);
    const note = requireReason(input.note);
    if (payment.status !== "PAID") throw new JobGuardError("Only paid payments can be refunded.");
    const reserved = await tx.refund.aggregate({ where: { spaceId: context.spaceId, paymentId: payment.id, status: "PENDING" }, _sum: { amount: true } });
    const available = payment.amount - payment.amountRefunded - (reserved._sum.amount ?? 0);
    const amount = money(input.amount ?? available);
    if (!amount || amount > available) throw new JobGuardError("Refund total cannot exceed the amount paid or reserved for refund.");
    const refund = await tx.refund.create({ data: { spaceId: context.spaceId, paymentId: payment.id, amount, reason: input.reason, note, createdById: context.actorId } });
    await recordAuditEvent({ action: "payment.refund_proposed", actorUserId: context.actorId, spaceId: context.spaceId,
      targetType: "Refund", targetId: refund.id, metadata: { paymentId: payment.id, amount, reason: input.reason }, client: tx });
    return refund;
  });
}

export type RefundContext = { spaceId: string; actorId: string; refundId: string };
async function refundPaymentId(spaceId: string, refundId: string) {
  const refund = await prisma.refund.findFirst({ where: { spaceId, id: refundId } });
  if (!refund) throw new JobNotFoundError();
  return refund.paymentId;
}

/** Gateway intent is durable before HTTP; ambiguous requests remain reserved until reconciled. */
export async function processRefund(context: RefundContext, clients: GatewayClients = {}) {
  const paymentId = await refundPaymentId(context.spaceId, context.refundId);
  const first = await prisma.$transaction(async (tx) => {
    const { payment } = await lockPayment(tx, context.spaceId, paymentId);
    await moneyAccess(tx, context.spaceId, context.actorId);
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: context.refundId } });
    if (refund.status === "SUCCEEDED") return false;
    if (refund.status !== "PENDING") throw new JobGuardError("This refund is not pending. Propose a new refund after a confirmed failure.");
    if (payment.status !== "PAID") throw new JobGuardError("Only paid payments can be refunded.");
    if (!["RAZORPAY", "STRIPE"].includes(payment.method ?? "")) throw new JobGuardError("Record this refund as handed back.");
    await jobGateway(tx, context.spaceId, payment.method, clients);
    if (!payment.providerPaymentId) throw new JobGuardError("The gateway payment reference is missing.");
    await tx.refund.update({ where: { id: refund.id }, data: { viaGateway: true, gatewayAttemptedAt: refund.gatewayAttemptedAt ?? new Date() } });
    return !refund.gatewayAttemptedAt;
  });
  const result = await prisma.$transaction(async (tx) => {
    const { job, payment } = await lockPayment(tx, context.spaceId, paymentId);
    await moneyAccess(tx, context.spaceId, context.actorId);
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: context.refundId } });
    if (refund.status !== "PENDING") return { refund, ids: [] };
    const { gateway, credentials, provider } = await jobGateway(tx, context.spaceId, payment.method, clients);
    const args = { gatewayPaymentId: payment.providerPaymentId!, gatewayRefundId: refund.providerRefundId, refundId: refund.id, amountMinor: refund.amount, currency: payment.currency };
    try {
      let response = first ? null : await gateway.fetchRefund(credentials, args);
      if (!response && !first && (provider === "RAZORPAY" || Date.now() - refund.gatewayAttemptedAt!.getTime() > 23 * 3600_000)) {
        throw new JobGuardError("The refund response is unresolved. Reconcile it with the provider before retrying.");
      }
      response ??= await gateway.refund(credentials, args);
      if (!response.gatewayRefundId) throw new Error("The provider did not return a refund reference.");
      await tx.refund.update({ where: { id: refund.id }, data: { providerRefundId: response.gatewayRefundId,
        ...(response.status === "failed" ? { status: "FAILED", failureReason: "The gateway rejected the refund." } : {}) } });
      const ids = response.status === "processed" ? await succeedRefund(tx, job, payment, refund, response.gatewayRefundId) : [];
      return { refund: await tx.refund.findUniqueOrThrow({ where: { id: refund.id } }), ids };
    } catch (error) {
      if (error instanceof JobGuardError) throw error;
      const failed = error instanceof GatewayError && !error.retryable && error.status >= 400;
      const updated = await tx.refund.update({ where: { id: refund.id }, data: { ...(failed ? { status: "FAILED" } : {}),
        failureReason: failed ? "The gateway rejected the refund." : "The provider response is unresolved; reconcile before retrying." } });
      return { refund: updated, ids: [] };
    }
  }, { timeout: 45000 });
  await enqueueWebhookDeliveries(result.ids);
  return result.refund;
}

export async function handBackRefund(context: RefundContext, reference: string) {
  const paymentId = await refundPaymentId(context.spaceId, context.refundId);
  const result = await prisma.$transaction(async (tx) => {
    const { job, payment } = await lockPayment(tx, context.spaceId, paymentId);
    await moneyAccess(tx, context.spaceId, context.actorId);
    const note = requireReason(reference);
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: context.refundId } });
    if (refund.status === "SUCCEEDED") return { refund, ids: [] };
    if (refund.status !== "PENDING" || refund.viaGateway || ["RAZORPAY", "STRIPE"].includes(payment.method ?? "")) throw new JobGuardError("This refund must be processed through its gateway.");
    await tx.refund.update({ where: { id: refund.id }, data: { note: `${refund.note}\nHanded back: ${note}`.trim(), createdById: refund.createdById ?? context.actorId } });
    await recordAuditEvent({ action: "payment.refund_handed_back", actorUserId: context.actorId, spaceId: context.spaceId,
      targetType: "Refund", targetId: refund.id, client: tx });
    const ids = await succeedRefund(tx, job, payment, refund);
    return { refund: await tx.refund.findUniqueOrThrow({ where: { id: refund.id } }), ids };
  });
  await enqueueWebhookDeliveries(result.ids);
  return result.refund;
}
