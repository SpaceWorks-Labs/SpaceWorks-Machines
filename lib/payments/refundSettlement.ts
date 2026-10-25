import "server-only";
import type { Job, Payment, PaymentProvider, Prisma, Refund } from "@prisma/client";
import { JobGuardError } from "@/lib/jobs/context";
import { lockPayment } from "./jobs/context";
import { paymentNotice } from "./jobs/notifications";
import { updatePaymentState } from "./jobs/state";
import { financeMethodOf, postFinance } from "@/lib/finance/post";
import type { GatewayEvent } from "./gateway";

export async function succeedRefund(tx: Prisma.TransactionClient, job: Job, payment: Payment, refund: Refund, providerRefundId?: string) {
  if (refund.status === "SUCCEEDED") return [];
  if (payment.status !== "PAID" || refund.amount > payment.amount - payment.amountRefunded) throw new JobGuardError("Refund total cannot exceed the amount paid.");
  await tx.refund.update({ where: { id: refund.id }, data: { status: "SUCCEEDED", processedAt: new Date(), failureReason: "", ...(providerRefundId ? { providerRefundId } : {}) } });
  await tx.payment.update({ where: { id: payment.id }, data: { amountRefunded: { increment: refund.amount } } });
  await updatePaymentState(tx, job);
  const posted = await postFinance(tx, { spaceId: job.spaceId, direction: "OUT", category: "JOB_REFUND", amountMinor: refund.amount, currency: payment.currency,
    method: financeMethodOf(payment.method), reference: providerRefundId ?? refund.providerRefundId ?? "", occurredAt: new Date(), sourceType: "Refund", sourceId: refund.id,
    actorId: refund.createdById, note: `Job ${job.number}`, machineId: job.assignedMachineId ?? job.machineId, typeId: job.typeId });
  return [...await paymentNotice(tx, job, payment, "refunded", refund.amount, refund.id), ...posted.webhookDeliveryIds];
}

export async function settleRefund(tx: Prisma.TransactionClient, spaceId: string, provider: PaymentProvider, event: Extract<GatewayEvent, { type: "refund-processed" | "refund-failed" }>) {
  const found = await tx.refund.findFirst({ where: { spaceId, viaGateway: true, payment: { method: provider === "OFFLINE" ? undefined : provider },
    OR: [...(event.refundId ? [{ id: event.refundId }] : []), ...(event.gatewayRefundId ? [{ providerRefundId: event.gatewayRefundId }] : [])] } });
  if (!found) return null;
  const { job, payment } = await lockPayment(tx, spaceId, found.paymentId);
  const refund = await tx.refund.findUniqueOrThrow({ where: { id: found.id } });
  if ((event.refundId && refund.id !== event.refundId) || (refund.providerRefundId && refund.providerRefundId !== event.gatewayRefundId)) throw new JobGuardError("Refund reference does not match.");
  if (refund.status === "SUCCEEDED") return [];
  if (event.type === "refund-processed") {
    if (event.amountMinor !== refund.amount) throw new JobGuardError("Refund amount does not match.");
    return succeedRefund(tx, job, payment, refund, event.gatewayRefundId);
  }
  await tx.refund.update({ where: { id: refund.id }, data: { status: "FAILED", providerRefundId: event.gatewayRefundId, failureReason: event.reason.slice(0, 300) } });
  return [];
}
