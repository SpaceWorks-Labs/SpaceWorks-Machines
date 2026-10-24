import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { faultNumber } from "@/lib/upkeep/labels";
import { machineTypeWhere } from "@/lib/typeScope";

type Props = { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ status?: string }> };

/** Fault board: open faults by default, every fault with ?status=all. */
export async function loadFaultsView({ params, searchParams }: Props) {
  const { spaceSlug } = await params;
  const { space, typeScope } = await requireSpaceCapability(spaceSlug, "maintenance.view");
  const all = (await searchParams).status === "all";
  const [profile, faults] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, timezone: true } }),
    prisma.faultReport.findMany({ where: { spaceId: space.id, ...machineTypeWhere(typeScope), ...(all ? {} : { status: { in: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] } }) },
      orderBy: { number: "desc" }, take: 200,
      select: { number: true, title: true, severity: true, status: true, createdAt: true, machine: { select: { name: true } } } }),
  ]);
  return { space: { ...space, ...profile }, all,
    faults: faults.map((fault) => ({ ...fault, label: faultNumber(fault.number), machine: fault.machine.name, createdAt: fault.createdAt.toISOString() })) };
}
