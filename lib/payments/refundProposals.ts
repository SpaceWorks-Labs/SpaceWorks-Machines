import "server-only";
import type { Job, Prisma, RefundReason } from "@prisma/client";
import { jobSettings } from "@/lib/jobs/context";
import { refundFor, money } from "./jobs/math";
import { totals } from "./jobs/state";

/** Called with the job locked. Pending proposals reserve the refundable amount. */
export async function proposeRefunds(tx: Prisma.TransactionClient, job: Job, reason: RefundReason, amount: number) {
  let remaining = money(amount);
  const { payments } = await totals(tx, job);
  for (const payment of payments.filter((p) => p.status === "PAID").sort((a, b) => a.id.localeCompare(b.id))) {
    const reserved = await tx.refund.aggregate({ where: { spaceId: job.spaceId, paymentId: payment.id, status: "PENDING" }, _sum: { amount: true } });
    const available = payment.amount - payment.amountRefunded - (reserved._sum.amount ?? 0);
    const part = Math.min(remaining, available);
    if (part > 0) {
      await tx.refund.create({ data: { spaceId: job.spaceId, paymentId: payment.id, amount: part, reason } });
      remaining -= part;
    }
    if (!remaining) break;
  }
}

export async function proposeOutcomeRefund(tx: Prisma.TransactionClient, job: Job, outcome: "rejected" | "cancelled" | "failed") {
  const settings = await jobSettings(tx, job.spaceId);
  const rule = outcome === "rejected" ? settings.refundOnReject : outcome === "cancelled" ? settings.refundOnCancel : settings.refundOnFailure;
  const percent = outcome === "rejected" ? settings.refundOnRejectPercent : outcome === "cancelled" ? settings.refundOnCancelPercent : settings.refundOnFailurePercent;
  const t = await totals(tx, job);
  const reason = outcome === "rejected" ? "JOB_REJECTED" : outcome === "cancelled" ? "JOB_CANCELLED" : "JOB_FAILED";
  const pending = await tx.refund.aggregate({ where: { spaceId: job.spaceId, paymentId: { in: t.payments.map((p) => p.id) }, status: "PENDING" }, _sum: { amount: true } });
  // Re-running for a late capture proposes only the outstanding policy entitlement.
  await proposeRefunds(tx, job, reason, Math.max(0, refundFor(t.paid, rule, percent) - t.refunded - (pending._sum.amount ?? 0)));
}

export async function proposeOverpayment(tx: Prisma.TransactionClient, job: Job) {
  if (job.finalAmount == null) return;
  const t = await totals(tx, job);
  const pending = await tx.refund.aggregate({ where: { spaceId: job.spaceId, paymentId: { in: t.payments.map((p) => p.id) }, status: "PENDING" }, _sum: { amount: true } });
  await proposeRefunds(tx, job, "OVERPAYMENT", Math.max(0, t.net - job.finalAmount - (pending._sum.amount ?? 0)));
}
