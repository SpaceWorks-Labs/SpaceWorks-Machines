import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { spaceAllows } from "@/lib/permissionRoles";
import { jobDetail } from "@/lib/jobs/viewQueries";
import { JOB_DEFAULTS } from "@/lib/jobs/settingsDefaults";

export async function loadRequesterJobView({ params }: { params: Promise<{ spaceSlug: string; number: string }> }) {
  const session = await requireAuth();
  const { spaceSlug, number } = await params;
  const space = await prisma.space.findUnique({ where: { slug: spaceSlug }, select: { id: true, name: true, slug: true } });
  if (!space || !/^\d{1,10}$/.test(number) || +number > 2147483647) notFound();
  const found = await prisma.job.findFirst({ where: { spaceId: space.id, number: +number, requesterId: session.user.id, space: { status: { in: ["ACTIVE", "SUSPENDED", "ARCHIVED"] } } } });
  if (!found) notFound();
  const settings = await prisma.spaceJobSettings.findUnique({ where: { spaceId: space.id } }) ?? JOB_DEFAULTS;
  const profile = await prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { status: true } });
  const job = await jobDetail(space.id, +number, false, true);
  if (!job || !spaceAllows(profile.status, "jobs.view")) notFound();
  return { space, job, canCancel: profile.status === "ACTIVE" && settings.allowRequesterCancel && ["SUBMITTED", "APPROVED"].includes(job.status),
    canPay: profile.status === "ACTIVE" && settings.paymentsEnabled && settings.onlineMethods.length > 0 && !["REJECTED", "CANCELLED", "FAILED"].includes(job.status),
    canNote: profile.status === "ACTIVE" };
}
