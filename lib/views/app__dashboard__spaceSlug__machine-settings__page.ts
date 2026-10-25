import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { can, spaceAllows } from "@/lib/permissionRoles";
import { TYPE_SUMMARY, typeSummary } from "@/lib/machines/queries";

export async function loadMachineSettingsView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const { space, membership, typeScope } = await requireSpaceCapability(spaceSlug, "machines.view");
  const allowed = (capability: Parameters<typeof can>[1]) => can(membership.role, capability) && spaceAllows(space.status, capability);
  const [profile, rows] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true } }),
    prisma.machineType.findMany({ where: { spaceId: space.id, ...(typeScope ? { id: { in: typeScope } } : {}) }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { ...TYPE_SUMMARY, _count: { select: { machines: { where: { spaceId: space.id } } } } } }),
  ]);
  return { space: { ...space, ...profile },
    canManage: allowed("machine.settings"), canPricing: allowed("type.settings"), canPrinters: allowed("printers.manage"),
    types: rows.map((row) => ({ ...typeSummary(row), machineCount: row._count.machines })) };
}
