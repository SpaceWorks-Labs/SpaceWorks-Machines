import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { can, spaceAllows } from "@/lib/permissionRoles";
import { typeWhere } from "@/lib/typeScope";

type Props = { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ status?: string }> };

/**
 * The to-buy list. Anyone who keeps machines going can ask; the machine manager approves, buys and receives,
 * and only they see amounts. A machine type manager sees items for their own machines and pools.
 */
export async function loadToBuyView({ params, searchParams }: Props) {
  const { spaceSlug } = await params;
  const { space, membership, typeScope } = await requireSpaceCapability(spaceSlug, "tobuy.request");
  const allowed = (capability: Parameters<typeof can>[1]) => can(membership.role, capability) && spaceAllows(space.status, capability);
  const open = (await searchParams).status !== "all";
  const scoped: Prisma.ToBuyItemWhereInput = typeScope === null ? {} : { OR: [{ machine: { typeId: { in: typeScope } } }, { pool: { typeId: { in: typeScope } } },
    { pool: { machine: { typeId: { in: typeScope } } } }] };
  const [profile, items, machines, pools] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, currency: true, locale: true } }),
    prisma.toBuyItem.findMany({ where: { spaceId: space.id, ...scoped, ...(open ? { status: { in: ["REQUESTED", "APPROVED", "BOUGHT"] } } : {}) },
      orderBy: { number: "desc" }, take: 300, include: { machine: { select: { name: true } }, pool: { select: { material: true, colour: true, brand: true } } } }),
    prisma.machine.findMany({ where: { spaceId: space.id, retiredAt: null, ...typeWhere(typeScope) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.consumablePool.findMany({ where: { spaceId: space.id, isActive: true, ...(typeScope === null ? {} : { OR: [{ typeId: { in: typeScope } }, { machine: { typeId: { in: typeScope } } }] }) },
      orderBy: { material: "asc" }, select: { id: true, material: true, colour: true, brand: true, unit: true } }),
  ]);
  const showMoney = allowed("finance.view");
  return {
    space: { ...space, ...profile }, open, canRequest: allowed("tobuy.request"), canManage: allowed("tobuy.manage"), showMoney, machines,
    pools: pools.map((pool) => ({ id: pool.id, label: [pool.brand, pool.material, pool.colour].filter(Boolean).join(" "), unit: pool.unit.toLowerCase() })),
    items: items.map((item) => ({ id: item.id, number: item.number, kind: item.kind, title: item.title, quantity: item.quantity.toString(), unit: item.unit, status: item.status,
      note: item.note, machine: item.machine?.name ?? null, pool: item.pool ? [item.pool.brand, item.pool.material, item.pool.colour].filter(Boolean).join(" ") : null,
      supplier: showMoney ? item.supplier : "", amount: showMoney ? item.amount : null, currency: item.currency, createdAt: item.createdAt.toISOString() })),
  };
}
