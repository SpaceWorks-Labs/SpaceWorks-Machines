import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";

export async function loadAccountJobsView() {
  const session = await requireAuth();
  const jobs = await prisma.job.findMany({ where: { requesterId: session.user.id }, orderBy: { submittedAt: "desc" },
    select: { id: true, number: true, title: true, status: true, submittedAt: true, space: { select: { name: true, slug: true } } } });
  return { jobs: jobs.map((j) => ({ ...j, submittedAt: j.submittedAt.toISOString() })) };
}
