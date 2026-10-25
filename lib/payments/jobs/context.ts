import "server-only";
import type { Payment, Prisma } from "@prisma/client";
import { can, isStaffRole, spaceAllows } from "@/lib/permissionRoles";
import { JobGuardError, JobNotFoundError, lockJob } from "@/lib/jobs/context";

export type PaymentContext = { spaceId: string; actorId: string; paymentId: string };

/** Every money operation locks job, then payment, then refund, in that order. */
export async function lockPayment(tx: Prisma.TransactionClient, spaceId: string, paymentId: string) {
  const found = await tx.payment.findFirst({ where: { id: paymentId, spaceId }, select: { jobId: true } });
  if (!found) throw new JobNotFoundError();
  const job = await lockJob(tx, spaceId, found.jobId);
  const rows = await tx.$queryRaw<Payment[]>`SELECT * FROM "Payment" WHERE "spaceId" = ${spaceId} AND "id" = ${paymentId} FOR UPDATE`;
  if (!rows[0]) throw new JobNotFoundError();
  return { job, payment: rows[0] };
}

export async function moneyAccess(tx: Prisma.TransactionClient, spaceId: string, actorId: string, requesterId?: string) {
  const space = await tx.space.findUnique({ where: { id: spaceId } });
  const member = await tx.spaceMember.findUnique({ where: { userId_spaceId: { userId: actorId, spaceId } }, include: { user: true } });
  const role = member?.status === "ACTIVE" ? member.role : null;
  const manager = can(role, "payments.manage");
  if (!space || (!manager && requesterId !== actorId)) throw new JobNotFoundError();
  if (!spaceAllows(space.status, "payments.manage")) throw new JobGuardError("This space cannot change payments.");
  if (isStaffRole(role) && !member?.user.mfaEnabledAt) throw new JobGuardError("Set up an authenticator before managing payments.");
  return space;
}

export function noLiveCheckout(payment: Payment) {
  if (payment.checkoutKey || payment.checkoutUrl) throw new JobGuardError("Resolve the online checkout before changing the payment method or waiving it.");
}
