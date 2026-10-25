import "server-only";
import type { Job, JobStatus, Prisma, SpaceJobSettings, SpaceRole } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { queueChatAlerts } from "@/lib/chat/notify";
import { enqueueOutbox } from "@/lib/outbox";
import { CAPABILITIES } from "@/lib/permissionRoles";
import { emitWebhook } from "@/lib/webhooks/emit";
import type { WebhookEvent } from "@/lib/webhooks/events";
import { JOB_EMAIL_EVENTS, type JobEmailEvent } from "@/lib/email/jobs";

const enabled = (config: Prisma.JsonValue, event: string) => !config || typeof config !== "object" || Array.isArray(config) ||
  (config as Record<string, unknown>)[event] !== false;

export async function jobEvent(tx: Prisma.TransactionClient, job: Job, kind: string, actorId: string | null,
  settings: SpaceJobSettings, fromStatus?: JobStatus, note = "", data?: Prisma.InputJsonObject) {
  await tx.jobEvent.create({ data: { spaceId: job.spaceId, jobId: job.id, kind, actorId, fromStatus,
    toStatus: job.status, note, data } });
  await recordAuditEvent({ action: `job.${kind}`, actorUserId: actorId, spaceId: job.spaceId,
    targetType: "Job", targetId: job.id, metadata: { from: fromStatus ?? null, to: job.status,
      ...(data?.paymentOverride === true ? { paymentOverride: true } : {}),
      ...(typeof data?.priceOverride === "number" ? { priceOverride: data.priceOverride } : {}) }, client: tx });
  const webhookDeliveryIds = await emitWebhook(tx, job.spaceId, `job.${kind}` as WebhookEvent,
    { jobId: job.id, number: job.number, status: job.status });
  if ((JOB_EMAIL_EVENTS as readonly string[]).includes(kind) && enabled(settings.requesterEmails, kind)) {
    const user = await tx.user.findUnique({ where: { id: job.requesterId } });
    if (user?.email) await enqueueOutbox(tx, "job-requester", { spaceId: job.spaceId, jobId: job.id,
      to: user.email, event: kind as JobEmailEvent });
  }
  if (["submitted", "cancelled", "failed"].includes(kind) && enabled(settings.staffAlerts, kind)) {
    const staff = await tx.spaceMember.findMany({ where: { spaceId: job.spaceId, status: "ACTIVE",
      role: { in: [...CAPABILITIES["jobs.review"]] as SpaceRole[] }, user: { email: { not: null }, emailVerified: { not: null } } },
      select: { user: { select: { email: true } } } });
    for (const to of new Set(staff.map((m) => m.user.email!))) await enqueueOutbox(tx, "job-staff", { spaceId: job.spaceId, jobId: job.id, to, event: kind });
    const event = kind as "submitted" | "cancelled" | "failed";
    await queueChatAlerts(tx, job.spaceId, `job-${event}`, { jobId: job.id });
  }
  return webhookDeliveryIds;
}
