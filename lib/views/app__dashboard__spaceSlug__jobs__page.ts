import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { can, spaceAllows } from "@/lib/permissionRoles";
import { intakeOptions } from "@/lib/jobs/intake";
import { JobPaymentState } from "@prisma/client";
import { inScope, typeWhere } from "@/lib/typeScope";

export type JobFilters = { type?: string; machine?: string; requester?: string; payment?: string };
export async function loadJobsView({ params, searchParams }: { params: Promise<{ spaceSlug: string }>; searchParams: Promise<JobFilters> }) {
  const access = await requireSpaceCapability((await params).spaceSlug, "jobs.view");
  const { space, membership, typeScope } = access;
  const filters = await searchParams;
  const paymentState = Object.values(JobPaymentState).find((v) => v === filters.payment);
  const [jobs, profile, types, machines] = await Promise.all([
    prisma.job.findMany({ where: { spaceId: space.id, ...typeWhere(typeScope), ...(typeof filters.type === "string" && filters.type ? { typeId: filters.type } : {}),
      ...(typeof filters.machine === "string" && filters.machine ? { OR: [{ machineId: filters.machine }, { assignedMachineId: filters.machine }] } : {}),
      ...(typeof filters.requester === "string" && filters.requester ? { requester: { OR: [{ email: { contains: filters.requester, mode: "insensitive" } }, { name: { contains: filters.requester, mode: "insensitive" } }] } } : {}),
      ...(paymentState ? { paymentState } : {}) }, orderBy: [{ priority: "desc" }, { submittedAt: "asc" }],
      select: { id: true, number: true, title: true, status: true, paymentState: true, type: { select: { name: true } }, assignedMachine: { select: { name: true } }, requester: { select: { name: true, email: true } } } }),
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, currency: true } }),
    prisma.machineType.findMany({ where: { spaceId: space.id, ...(typeScope ? { id: { in: typeScope } } : {}) }, select: { id: true, name: true } }),
    prisma.machine.findMany({ where: { spaceId: space.id, ...typeWhere(typeScope) }, select: { id: true, name: true } }),
  ]);
  const canReview = can(membership.role, "jobs.review") && spaceAllows(space.status, "jobs.review");
  const intake = canReview ? await intakeOptions(space.id, true) : null;
  // A machine type manager submits on someone's behalf only for their own types.
  return { space: { ...space, ...profile }, filters, jobs, types, machines, canReview,
    intake: intake && { ...intake, types: intake.types.filter((type) => inScope(typeScope, type.id)), machines: intake.machines.filter((machine) => inScope(typeScope, machine.typeId)) } };
}
