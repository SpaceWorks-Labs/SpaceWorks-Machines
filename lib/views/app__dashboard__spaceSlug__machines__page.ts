import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { can, spaceAllows } from "@/lib/permissionRoles";
import { readFields } from "@/lib/machines/fields";
import { MACHINE_CARD, machineCard, machineStatusCounts } from "@/lib/machines/queries";
import { MACHINE_STATUSES } from "@/lib/machines/schemas";
import { typeWhere } from "@/lib/typeScope";

type Props = {
  params: Promise<{ spaceSlug: string }>;
  searchParams: Promise<{ type?: string | string[]; status?: string | string[] }>;
};

/**
 * Staff catalogue. Retired machines have their own filter and never enter live status counts. A machine type manager
 * sees only the types assigned to them.
 */
export async function loadMachinesView({ params, searchParams }: Props) {
  const { spaceSlug } = await params;
  const { space, membership, typeScope } = await requireSpaceCapability(spaceSlug, "machines.view");
  const filters = await searchParams;
  const [profile, types, totals] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, currency: true } }),
    prisma.machineType.findMany({ where: { spaceId: space.id, ...(typeScope ? { id: { in: typeScope } } : {}) }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, icon: true, archivedAt: true, specFields: true, materials: true, colours: true } }),
    machineStatusCounts(space.id, typeScope),
  ]);
  const typeId = typeof filters.type === "string" && types.some((type) => type.id === filters.type) ? filters.type : "";
  const status = MACHINE_STATUSES.find((status) => status === filters.status) ?? (filters.status === "RETIRED" ? "RETIRED" : "");
  const rows = await prisma.machine.findMany({
    where: { spaceId: space.id, ...typeWhere(typeScope), ...(typeId ? { typeId } : {}), retiredAt: status === "RETIRED" ? { not: null } : null,
      ...(status && status !== "RETIRED" ? { status } : {}) },
    orderBy: { name: "asc" }, select: MACHINE_CARD,
  });
  return {
    space: { ...space, ...profile }, totals, typeId, status,
    canManage: can(membership.role, "machines.manage") && spaceAllows(space.status, "machines.manage"),
    canFinance: can(membership.role, "finance.view"),
    types: types.map((type) => ({ id: type.id, name: type.name, icon: type.icon, archived: type.archivedAt !== null,
      specFields: readFields(type.specFields), materials: type.materials, colours: type.colours })),
    machines: rows.map(machineCard),
  };
}
