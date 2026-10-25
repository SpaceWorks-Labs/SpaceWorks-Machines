import type { Job, Prisma } from "@prisma/client";

/** M3b injects payment settlement here. Hooks run inside the job transaction; no network calls. */
export interface JobPaymentEffects {
  onApproved(tx: Prisma.TransactionClient, job: Job): Promise<void>;
  onCompleted(tx: Prisma.TransactionClient, job: Job): Promise<void>;
  canStart(tx: Prisma.TransactionClient, job: Job): Promise<boolean>;
  canCollect(tx: Prisma.TransactionClient, job: Job): Promise<boolean>;
  onRejectedCancelledFailed(tx: Prisma.TransactionClient, job: Job, outcome: "rejected" | "cancelled" | "failed"): Promise<void>;
}

const free = (job: Job) => job.quotedAmount === 0 && (job.finalAmount == null || job.finalAmount === 0);
async function state(tx: Prisma.TransactionClient, job: Job) {
  await tx.job.update({ where: { spaceId_id: { spaceId: job.spaceId, id: job.id } },
    data: { paymentState: free(job) ? "NOT_REQUIRED" : "QUOTED" } });
}
export const freeJobPaymentEffects: JobPaymentEffects = {
  onApproved: state, onCompleted: state,
  async canStart(_tx, job) { return free(job); },
  async canCollect(_tx, job) { return free(job); },
  async onRejectedCancelledFailed() {},
};
