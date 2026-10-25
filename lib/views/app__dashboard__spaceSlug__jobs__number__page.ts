import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requireSpaceCapability, spaceAllows } from "@/lib/permissions";
import { jobDetail } from "@/lib/jobs/viewQueries";
import { JOB_DEFAULTS } from "@/lib/jobs/settingsDefaults";
import { inScope } from "@/lib/typeScope";

export async function loadStaffJobView({ params }: { params: Promise<{ spaceSlug: string; number: string }> }) {
  const { spaceSlug, number } = await params;
  const { space, membership, userId, typeScope } = await requireSpaceCapability(spaceSlug, "jobs.view");
  if (!/^\d{1,10}$/.test(number) || +number > 2147483647) notFound();
  const canMoney = can(membership.role, "payments.view");
  const job = await jobDetail(space.id, +number, true, canMoney);
  if (!job || !inScope(typeScope, job.typeId)) notFound();
  const [profile, machines, pools, settings, requester] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true } }),
    prisma.machine.findMany({ where: { spaceId: space.id, typeId: job.typeId, retiredAt: null, acceptsJobs: true }, select: { id: true, name: true, status: true } }),
    prisma.consumablePool.findMany({ where: { spaceId: space.id, isActive: true }, select: { id: true, material: true, colour: true, unit: true } }),
    prisma.spaceJobSettings.findUnique({ where: { spaceId: space.id } }),
    prisma.job.findFirstOrThrow({ where: { spaceId: space.id, id: job.id }, select: { requester: { select: { name: true, email: true } } } }),
  ]);
  const allowed = (capability: "jobs.review" | "jobs.operate" | "payments.manage") => can(membership.role, capability) && spaceAllows(space.status, capability);
  return { space: { ...space, ...profile }, job, userId, machines, pools, requester: requester.requester,
    canReview: allowed("jobs.review"), canOperate: allowed("jobs.operate"), canManagePayments: allowed("payments.manage"), canMoney,
    offlineMethods: (settings ?? JOB_DEFAULTS).offlineMethods };
}
