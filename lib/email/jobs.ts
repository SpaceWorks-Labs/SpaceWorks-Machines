import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { asRecord, isBoundedString, isEmail } from "@/lib/outboxPayload";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";
import { absoluteUrl, sendBrandedEmail } from "./message";

export const JOB_EMAIL_EVENTS = ["submitted", "approved", "rejected", "started", "completed", "failed", "cancelled", "payment", "refund"] as const;
export type JobEmailEvent = typeof JOB_EMAIL_EVENTS[number];
type JobEmailPayload = { spaceId: string; jobId: string; to: string; event: JobEmailEvent };
export function asJobEmailPayload(value: Prisma.JsonValue): JobEmailPayload | null {
  const p = asRecord(value);
  if (!p || !isEmail(p.to) || !isBoundedString(p.spaceId, 128) || !isBoundedString(p.jobId, 128) ||
    !JOB_EMAIL_EVENTS.includes(p.event as JobEmailEvent)) return null;
  return p as JobEmailPayload;
}
const labels: Record<JobEmailEvent, string> = { submitted: "Job submitted", approved: "Job approved", rejected: "Job rejected",
  started: "Job started", completed: "Ready to collect", failed: "Job failed", cancelled: "Job cancelled",
  payment: "Payment received", refund: "Refund issued" };

export async function deliverJobEmail(payload: JobEmailPayload, messageId: string, staff: boolean): Promise<"sent" | "dropped"> {
  const job = await prisma.job.findFirst({ where: { spaceId: payload.spaceId, id: payload.jobId }, include: { space: true } });
  if (!job || !isCurrencyCode(job.currency)) return "dropped";
  const heading = labels[payload.event];
  const paragraphs = [`J-${String(job.number).padStart(4, "0")}: ${job.title}`];
  if (["rejected", "failed", "cancelled"].includes(payload.event) && job.statusReason) paragraphs.push(job.statusReason);
  const amount = payload.event === "approved" ? job.quotedAmount : payload.event === "completed" ? job.finalAmount : null;
  if (amount != null) paragraphs.push(`${payload.event === "approved" ? "Quote" : "Final price"}: ${formatMoney(amount, job.currency, job.space.locale ?? undefined)}.`);
  if (payload.event === "completed") paragraphs.push("Your job is ready to collect.");
  if (amount != null && amount > job.amountPaid) paragraphs.push("Payment is due. Open the job to see the amount due and payment options.");
  const path = staff ? `/dashboard/${job.space.slug}/jobs/${job.number}` : `/s/${job.space.slug}/jobs/${job.number}`;
  await sendBrandedEmail({ to: payload.to, spaceId: payload.spaceId, messageId,
    subject: `${job.space.name}: ${heading}`, heading, paragraphs,
    action: { label: "Open job", url: absoluteUrl(path) } });
  return "sent";
}
