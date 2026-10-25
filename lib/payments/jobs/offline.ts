import "server-only";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { JobGuardError, jobSettings, requireReason } from "@/lib/jobs/context";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import { lockPayment, moneyAccess, noLiveCheckout, type PaymentContext } from "./context";
import { paidPayment } from "./settlement";
import { updatePaymentState } from "./state";

const offline = ["CASH", "UPI", "BANK_TRANSFER", "CARD_TERMINAL", "OTHER"] as const;
type OfflineMethod = typeof offline[number];

export async function recordOfflinePayment(context: PaymentContext, input: { method: OfflineMethod; reference: string; note?: string }) {
  const result = await prisma.$transaction(async (tx) => {
    const { job, payment } = await lockPayment(tx, context.spaceId, context.paymentId);
    const space = await moneyAccess(tx, context.spaceId, context.actorId);
    if (space.status !== "ACTIVE") throw new JobGuardError("This space cannot receive new payments.");
    if (!["PENDING", "FAILED"].includes(payment.status) || payment.recordedById) throw new JobGuardError("This payment has already been recorded.");
    noLiveCheckout(payment);
    const settings = await jobSettings(tx, context.spaceId);
    if (!settings.paymentsEnabled || !offline.includes(input.method) || !settings.offlineMethods.includes(input.method as PaymentMethod)) throw new JobGuardError("This payment method is not enabled.");
    const reference = requireReason(input.reference);
    const updated = await tx.payment.update({ where: { id: payment.id }, data: { status: "PENDING", method: input.method, reference,
      note: input.note?.trim().slice(0, 2000) ?? "", recordedById: context.actorId,
      ...(space.offlineConfirmationRequired ? {} : { confirmedById: context.actorId, confirmedAt: new Date() }) } });
    await recordAuditEvent({ action: "payment.offline_recorded", actorUserId: context.actorId, spaceId: job.spaceId,
      targetType: "Payment", targetId: payment.id, metadata: { method: input.method, awaitingConfirmation: space.offlineConfirmationRequired }, client: tx });
    const ids = space.offlineConfirmationRequired ? [] : await paidPayment(tx, job, updated);
    await updatePaymentState(tx, job);
    return { payment: await tx.payment.findUniqueOrThrow({ where: { id: payment.id } }), ids };
  });
  await enqueueWebhookDeliveries(result.ids);
  return result.payment;
}

export async function confirmOfflinePayment(context: PaymentContext) {
  const result = await prisma.$transaction(async (tx) => {
    const { job, payment } = await lockPayment(tx, context.spaceId, context.paymentId);
    await moneyAccess(tx, context.spaceId, context.actorId);
    if (!payment.recordedById || !offline.includes(payment.method as OfflineMethod) || payment.status !== "PENDING") throw new JobGuardError("This payment is not awaiting confirmation.");
    if (payment.recordedById === context.actorId) throw new JobGuardError("A different person must confirm this payment.");
    const updated = await tx.payment.update({ where: { id: payment.id }, data: { confirmedById: context.actorId, confirmedAt: new Date() } });
    await recordAuditEvent({ action: "payment.offline_confirmed", actorUserId: context.actorId, spaceId: job.spaceId,
      targetType: "Payment", targetId: payment.id, client: tx });
    return { payment: updated, ids: await paidPayment(tx, job, updated) };
  });
  await enqueueWebhookDeliveries(result.ids);
  return { ...result.payment, status: "PAID" as const };
}

export async function waivePayment(context: PaymentContext, reason: string) {
  return prisma.$transaction(async (tx) => {
    const { job, payment } = await lockPayment(tx, context.spaceId, context.paymentId);
    await moneyAccess(tx, context.spaceId, context.actorId);
    const note = requireReason(reason);
    if (!["PENDING", "FAILED"].includes(payment.status) || payment.recordedById) throw new JobGuardError("Only unpaid, unrecorded payments can be waived.");
    noLiveCheckout(payment);
    const updated = await tx.payment.update({ where: { id: payment.id }, data: { status: "WAIVED", note, recordedById: context.actorId } });
    await tx.jobEvent.create({ data: { spaceId: job.spaceId, jobId: job.id, kind: "payment_waived", actorId: context.actorId, note, data: { paymentId: payment.id } } });
    await recordAuditEvent({ action: "payment.waived", actorUserId: context.actorId, spaceId: job.spaceId,
      targetType: "Payment", targetId: payment.id, metadata: { reasonProvided: true }, client: tx });
    await updatePaymentState(tx, job);
    return updated;
  });
}
