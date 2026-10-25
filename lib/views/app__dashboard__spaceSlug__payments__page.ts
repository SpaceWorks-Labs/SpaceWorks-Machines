import { prisma } from "@/lib/db";
import { can, requireSpaceCapability, spaceAllows } from "@/lib/permissions";
import { listPayments } from "@/lib/payments/jobs/list";
import { JOB_DEFAULTS } from "@/lib/jobs/settingsDefaults";

export async function loadPaymentsView({ params, searchParams }: { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ status?: string; method?: string }> }) {
  const { space, membership, userId } = await requireSpaceCapability((await params).spaceSlug, "payments.view");
  const filters = await searchParams;
  const [profile, settings, payments] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true } }),
    prisma.spaceJobSettings.findUnique({ where: { spaceId: space.id } }), listPayments(space.id, filters),
  ]);
  return { space: { ...space, ...profile }, userId, filters, payments, offlineMethods: (settings ?? JOB_DEFAULTS).offlineMethods,
    canManage: can(membership.role, "payments.manage") && spaceAllows(space.status, "payments.manage") };
}
