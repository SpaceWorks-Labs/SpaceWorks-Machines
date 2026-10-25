import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { absoluteUrl } from "@/lib/email/message";
import { JobGuardError, jobSettings } from "@/lib/jobs/context";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import { GatewayError } from "../gateway";
import { jobGateway, type GatewayClients } from "./clients";
import { lockPayment, moneyAccess, type PaymentContext } from "./context";
import { paidPayment } from "./settlement";
import { terminalJob, updatePaymentState } from "./state";

export async function createJobCheckout(context: PaymentContext, clients: GatewayClients = {}) {
  // Commit an attempt before HTTP. A crash/timeout must reuse its idempotency key, never mint anew.
  await prisma.$transaction(async (tx) => {
    const { job, payment } = await lockPayment(tx, context.spaceId, context.paymentId);
    const space = await moneyAccess(tx, context.spaceId, context.actorId, job.requesterId);
    const settings = await jobSettings(tx, context.spaceId);
    if (space.status !== "ACTIVE" || !settings.paymentsEnabled || terminalJob(job)) throw new JobGuardError("This job cannot accept online payments.");
    if (!["PENDING", "FAILED"].includes(payment.status) || payment.recordedById) throw new JobGuardError("This payment is not payable.");
    const { provider } = await jobGateway(tx, context.spaceId, payment.method, clients);
    if (!settings.onlineMethods.includes(provider)) throw new JobGuardError("This online method is not enabled.");
    if (!payment.checkoutKey) await tx.payment.update({ where: { id: payment.id }, data: {
      method: provider, checkoutKey: randomUUID(), checkoutStartedAt: new Date() } });
  });
  const result = await prisma.$transaction(async (tx) => {
    const { job, payment } = await lockPayment(tx, context.spaceId, context.paymentId);
    const spaceAccess = await moneyAccess(tx, context.spaceId, context.actorId, job.requesterId);
    if (payment.status === "PAID") return { payment, ids: [] };
    const policy = await jobSettings(tx, context.spaceId);
    if (spaceAccess.status !== "ACTIVE" || !policy.paymentsEnabled || !payment.method || !policy.onlineMethods.includes(payment.method)) throw new JobGuardError("This job cannot accept online payments.");
    if (!["PENDING", "FAILED"].includes(payment.status) || payment.recordedById || terminalJob(job)) throw new JobGuardError("This payment is not payable.");
    if (!payment.checkoutKey) return { payment: null, ids: [] }; // Expiry may have arrived between transactions.
    const { gateway, credentials, provider } = await jobGateway(tx, context.spaceId, payment.method, clients);
    // An existing session is reused until the provider confirms expiry (clock time alone is insufficient).
    if (payment.providerOrderId && payment.checkoutUrl) {
      if (provider !== "STRIPE" || !payment.checkoutExpiresAt || payment.checkoutExpiresAt > new Date()) return { payment, ids: [] };
      const fetched = await gateway.fetchPayment(credentials, payment.providerOrderId);
      if (fetched.status === "paid") {
        if (fetched.amountMinor !== payment.amount || fetched.currency !== payment.currency || !fetched.gatewayPaymentId) throw new Error("Payment amount or currency does not match.");
        const ids = await paidPayment(tx, job, payment, fetched.gatewayPaymentId);
        return { payment: await tx.payment.findUniqueOrThrow({ where: { id: payment.id } }), ids };
      }
      if (fetched.status !== "failed" || fetched.reason !== "Checkout expired") return { payment, ids: [] };
      // Expiry is committed separately below before creating a replacement.
      await tx.payment.update({ where: { id: payment.id }, data: { checkoutKey: null, checkoutStartedAt: null, checkoutUrl: null, checkoutExpiresAt: new Date(0) } });
      return { payment: null, ids: [] };
    }
    // Razorpay has no create idempotency key: recover by unique reference_id first.
    const recovered = provider === "RAZORPAY" ? await gateway.findCheckout?.(credentials, payment.id) : null;
    if (!recovered && payment.checkoutStartedAt && Date.now() - payment.checkoutStartedAt.getTime() > 23 * 3600_000) {
      throw new JobGuardError("The checkout response is unresolved. Reconcile it with the provider before retrying.");
    }
    const user = await tx.user.findUniqueOrThrow({ where: { id: job.requesterId } });
    const space = await tx.space.findUniqueOrThrow({ where: { id: job.spaceId } });
    if (!user.email) throw new JobGuardError("The requester needs an email address.");
    const url = absoluteUrl(`/s/${space.slug}/jobs/${job.number}`);
    let checkout;
    try {
      checkout = recovered ?? await gateway.createCheckout(credentials, { paymentId: payment.id, spaceId: job.spaceId, reference: job.id,
        amountMinor: payment.amount, currency: payment.currency, description: `Job J-${String(job.number).padStart(4, "0")}`,
        spaceName: space.name, customer: { name: user.name ?? "", email: user.email }, successUrl: url, cancelUrl: url, checkoutKey: payment.checkoutKey! });
    } catch (error) {
      // Commit the release before rethrowing. Timeouts, conflicts and unknown responses retain the attempt.
      if (!(error instanceof GatewayError) || error.retryable || error.status < 400 || error.status >= 500 || [408, 409].includes(error.status)) throw error;
      await tx.payment.update({ where: { id: payment.id }, data: { checkoutKey: null, checkoutStartedAt: null } });
      return { payment: null, ids: [], error };
    }
    if (checkout.kind !== "redirect") throw new Error("The provider did not return a payment link.");
    const updated = await tx.payment.update({ where: { id: payment.id }, data: { status: "PENDING", providerOrderId: checkout.orderId,
      checkoutUrl: checkout.url, checkoutExpiresAt: checkout.expiresAt ?? null } });
    await updatePaymentState(tx, job);
    return { payment: updated, ids: [] };
  }, { timeout: 45000 });
  if ("error" in result) throw result.error;
  await enqueueWebhookDeliveries(result.ids);
  if (!result.payment) return createJobCheckout(context, clients);
  return result.payment;
}
