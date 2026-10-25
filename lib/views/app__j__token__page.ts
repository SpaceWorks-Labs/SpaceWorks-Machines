import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { queueFor } from "@/lib/jobs/viewQueries";

/** The bearer link returns this allowlist only, including in the React Server Component payload. */
export async function loadPublicJobView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const job = await prisma.job.findFirst({ where: { statusToken: token, space: { status: { in: ["ACTIVE", "SUSPENDED", "ARCHIVED"] } } },
    select: { id: true, spaceId: true, typeId: true, machineId: true, assignedMachineId: true, status: true, title: true,
      priority: true, estimatedMinutes: true, submittedAt: true, reviewedAt: true, startedAt: true, completedAt: true, collectedAt: true, failedAt: true, cancelledAt: true } });
  if (!job) notFound();
  const timestamps = { Submitted: job.submittedAt, Reviewed: job.reviewedAt, Started: job.startedAt, Completed: job.completedAt, Collected: job.collectedAt, Failed: job.failedAt, Cancelled: job.cancelledAt };
  return { title: job.title, status: job.status, queue: await queueFor(job),
    timestamps: Object.entries(timestamps).flatMap(([label, value]) => value ? [{ label, value: value.toISOString() }] : []) };
}
