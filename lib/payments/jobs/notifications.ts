import "server-only";
import type { Job, Payment, Prisma, SpaceRole } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { queueChatAlerts } from "@/lib/chat/notify";
import { jobSettings } from "@/lib/jobs/context";
import { enqueueOutbox } from "@/lib/outbox";
import { CAPABILITIES } from "@/lib/permissionRoles";
import { emitWebhook } from "@/lib/webhooks/emit";

const enabled = (value: Prisma.JsonValue, event: string) => !value || typeof value !== "object" || Array.isArray(value) || value[event] !== false;

export async function paymentNotice(tx: Prisma.TransactionClient, job: Job, payment: Payment, event: "paid" | "refunded", amount: number, refundId?: string) {
  const settings = await jobSettings(tx, job.spaceId);
  const key = event === "paid" ? "payment" : "refund";
  await recordAuditEvent({ action: `payment.${event}`, actorUserId: null, spaceId: job.spaceId,
    targetType: "Payment", targetId: payment.id, metadata: { jobId: job.id, amount, currency: job.currency, ...(refundId ? { refundId } : {}) }, client: tx });
  const ids = await emitWebhook(tx, job.spaceId, `payment.${event}`, { jobId: job.id, paymentId: payment.id,
    amount, currency: job.currency, ...(refundId ? { refundId } : {}) });
  if (enabled(settings.requesterEmails, key)) {
    const user = await tx.user.findUnique({ where: { id: job.requesterId } });
    if (user?.email) await enqueueOutbox(tx, "job-requester", { spaceId: job.spaceId, jobId: job.id, to: user.email, event: key });
  }
  if (event === "paid" && enabled(settings.staffAlerts, key)) {
    const staff = await tx.spaceMember.findMany({ where: { spaceId: job.spaceId, status: "ACTIVE",
      role: { in: [...CAPABILITIES["jobs.review"]] as SpaceRole[] }, user: { emailVerified: { not: null } } }, include: { user: true } });
    for (const to of new Set(staff.map((m) => m.user.email).filter((email): email is string => !!email))) {
      await enqueueOutbox(tx, "job-staff", { spaceId: job.spaceId, jobId: job.id, to, event: key });
    }
    await queueChatAlerts(tx, job.spaceId, "job-payment", { jobId: job.id });
  }
  return ids;
}
