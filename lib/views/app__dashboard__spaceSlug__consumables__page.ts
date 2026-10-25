import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { can, spaceAllows } from "@/lib/permissionRoles";
import { POOL_ROW, poolRow } from "@/lib/machines/queries";

export async function loadConsumablesView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const { space, membership } = await requireSpaceCapability(spaceSlug, "consumables.view");
  const [profile, pools, types, machines, settings] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, currency: true } }),
    prisma.consumablePool.findMany({ where: { spaceId: space.id }, orderBy: [{ material: "asc" }, { createdAt: "asc" }], select: POOL_ROW }),
    prisma.machineType.findMany({ where: { spaceId: space.id, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, consumableUnit: true } }),
    prisma.machine.findMany({ where: { spaceId: space.id, retiredAt: null }, orderBy: { name: "asc" },
      select: { id: true, name: true, type: { select: { consumableUnit: true } } } }),
    prisma.spaceJobSettings.findUnique({ where: { spaceId: space.id }, select: { lowStockAlerts: true } }),
  ]);
  return { space: { ...space, ...profile }, pools: pools.map(poolRow), types,
    machines: machines.map((machine) => ({ id: machine.id, name: machine.name, consumableUnit: machine.type.consumableUnit })),
    canManage: can(membership.role, "consumables.manage") && spaceAllows(space.status, "consumables.manage"),
    canConfigureAlerts: can(membership.role, "space.settings") && spaceAllows(space.status, "space.settings"),
    lowStockAlerts: settings?.lowStockAlerts ?? true };
}
