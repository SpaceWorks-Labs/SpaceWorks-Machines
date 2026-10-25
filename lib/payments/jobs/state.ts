import "server-only";
import type { Job, Prisma } from "@prisma/client";
import { paymentState, money } from "./math";

export const terminalJob = (job: Job) => ["REJECTED", "CANCELLED", "FAILED"].includes(job.status);

export async function totals(tx: Prisma.TransactionClient, job: Job) {
  const payments = await tx.payment.findMany({ where: { spaceId: job.spaceId, jobId: job.id } });
  if (payments.some((p) => p.currency !== job.currency)) throw new Error("Payment currency does not match the job.");
  const paid = money(payments.filter((p) => p.status === "PAID").reduce((n, p) => n + p.amount, 0));
  const refunded = money(payments.reduce((n, p) => n + p.amountRefunded, 0));
  const waived = money(payments.filter((p) => p.status === "WAIVED").reduce((n, p) => n + p.amount, 0));
  return { payments, paid, refunded, waived, net: paid - refunded };
}

export async function updatePaymentState(tx: Prisma.TransactionClient, job: Job) {
  const t = await totals(tx, job);
  const total = terminalJob(job) ? 0 : job.finalAmount ?? job.quotedAmount ?? 0;
  await tx.job.update({ where: { spaceId_id: { spaceId: job.spaceId, id: job.id } }, data: {
    amountPaid: t.paid, amountRefunded: t.refunded,
    paymentState: paymentState(total, t.paid, t.refunded, t.waived, t.payments.some((p) => p.status === "PENDING" || p.status === "FAILED")),
  } });
  return t;
}
