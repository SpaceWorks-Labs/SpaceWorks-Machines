import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { can } from "@/lib/permissionRoles";
import { typeWhere } from "@/lib/typeScope";

export async function loadPricingRulesView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { space, membership, typeScope } = await requireSpaceCapability((await params).spaceSlug, "type.settings");
  // A machine type manager sees and edits only the rules for their types and those types' machines.
  const scoped = typeScope === null ? {} : { OR: [{ typeId: { in: typeScope } }, { machine: { typeId: { in: typeScope } } }] };
  const [profile, rules, types, machines] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, currency: true } }),
    prisma.pricingRule.findMany({ where: { spaceId: space.id, ...scoped }, orderBy: { createdAt: "asc" } }),
    prisma.machineType.findMany({ where: { spaceId: space.id, ...(typeScope ? { id: { in: typeScope } } : {}) }, select: { id: true, name: true } }),
    prisma.machine.findMany({ where: { spaceId: space.id, ...typeWhere(typeScope) }, select: { id: true, name: true, typeId: true } }),
  ]);
  return { space: { ...space, ...profile }, types, machines, allowSpaceDefault: can(membership.role, "machine.settings"), rules: rules.map((r) => ({ ...r, materialRate: r.materialRate.toString(), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })) };
}
