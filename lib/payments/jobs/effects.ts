import "server-only";
import type { Job, Prisma, PaymentKind } from "@prisma/client";
import type { JobPaymentEffects } from "@/lib/jobs/paymentEffects";
import { JobGuardError, jobSettings } from "@/lib/jobs/context";
import { proposeOutcomeRefund, proposeOverpayment } from "../refundProposals";
import { depositFor } from "./math";
import { totals, updatePaymentState } from "./state";

async function obligation(tx: Prisma.TransactionClient, job: Job, kind: PaymentKind, amount: number) {
  if (!amount) return;
  const existing = await tx.payment.findFirst({ where: { spaceId: job.spaceId, jobId: job.id, kind } });
  if (!existing) await tx.payment.create({ data: { spaceId: job.spaceId, jobId: job.id, kind, amount, currency: job.currency } });
}

export const jobPaymentEffects: JobPaymentEffects = {
  async onApproved(tx, job) {
    const settings = await jobSettings(tx, job.spaceId);
    if (job.paymentTiming === "PAY_LATER" && !settings.allowPayLater) throw new JobGuardError("Pay later is not available in this space.");
    const snapshot = job.pricingSnapshot as { rule?: { depositMode?: "NONE" | "FIXED" | "PERCENT"; depositValue?: number } } | null;
    const deposit = job.paymentTiming === "UPFRONT" ? 0 : depositFor(job.quotedAmount ?? 0, snapshot?.rule?.depositMode ?? "NONE", snapshot?.rule?.depositValue ?? 0);
    await tx.job.update({ where: { id: job.id }, data: { depositAmount: deposit } });
    if (job.paymentTiming === "UPFRONT") await obligation(tx, job, "CHARGE", job.quotedAmount ?? 0);
    else await obligation(tx, job, "DEPOSIT", deposit);
    await updatePaymentState(tx, job);
  },
  async onCompleted(tx, job) {
    // Unpaid obligations without a live checkout/recorded cash can be superseded by the final balance.
    await tx.payment.updateMany({ where: { spaceId: job.spaceId, jobId: job.id, status: { in: ["PENDING", "FAILED"] },
      checkoutKey: null, recordedById: null }, data: { status: "CANCELLED" } });
    const t = await totals(tx, job);
    const outstanding = t.payments.filter((p) => ["PENDING", "FAILED"].includes(p.status)).reduce((n, p) => n + p.amount, 0);
    await obligation(tx, job, "BALANCE", Math.max(0, (job.finalAmount ?? 0) - t.net - t.waived - outstanding));
    await proposeOverpayment(tx, job);
    await updatePaymentState(tx, job);
  },
  async canStart(tx, job) {
    const kind = job.paymentTiming === "UPFRONT" ? "CHARGE" : "DEPOSIT";
    const required = kind === "CHARGE" ? job.quotedAmount ?? 0 : job.depositAmount;
    const t = await totals(tx, job);
    return t.payments.filter((p) => p.kind === kind && ["PAID", "WAIVED"].includes(p.status))
      .reduce((n, p) => n + p.amount - p.amountRefunded, 0) >= required;
  },
  async canCollect(tx, job) {
    if (job.paymentTiming === "PAY_LATER" || !(await jobSettings(tx, job.spaceId)).requirePaymentBeforeCollection) return true;
    const t = await totals(tx, job);
    return t.net + t.waived >= (job.finalAmount ?? job.quotedAmount ?? 0);
  },
  async onRejectedCancelledFailed(tx, job, outcome) {
    await tx.payment.updateMany({ where: { spaceId: job.spaceId, jobId: job.id, status: { in: ["PENDING", "FAILED"] }, recordedById: null }, data: { status: "CANCELLED" } });
    await proposeOutcomeRefund(tx, job, outcome);
    await updatePaymentState(tx, job);
  },
};
