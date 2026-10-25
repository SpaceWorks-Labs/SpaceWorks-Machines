import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { can, spaceAllows } from "@/lib/permissionRoles";
import { POOL_ROW, poolRow } from "@/lib/machines/queries";

export async function loadConsumablePoolView({ params, searchParams }: {
  params: Promise<{ spaceSlug: string; poolId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { spaceSlug, poolId } = await params;
  const { space, membership } = await requireSpaceCapability(spaceSlug, "consumables.view");
  const pool = await prisma.consumablePool.findFirst({ where: { spaceId: space.id, id: poolId }, select: POOL_ROW });
  if (!pool) notFound();
  const filters = await searchParams;
  const requested = typeof filters.page === "string" && /^\d{1,6}$/.test(filters.page) ? Number(filters.page) : 1;
  const page = Math.max(1, requested);
  const [profile, rows, settings] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, currency: true, timezone: true } }),
    prisma.consumableAdjustment.findMany({ where: { spaceId: space.id, poolId: pool.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 50, take: 51,
      select: { id: true, kind: true, delta: true, balanceAfter: true, actorId: true, reason: true, createdAt: true } }),
    prisma.spaceJobSettings.findUnique({ where: { spaceId: space.id }, select: { lowStockAlerts: true } }),
  ]);
  // Actor ids come only from this pool's tenant-scoped ledger. Do not send account details to the frontend.
  const actorIds = [...new Set(rows.slice(0, 50).flatMap((row) => row.actorId ? [row.actorId] : []))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(actors.map((actor) => [actor.id, actor.name ?? "Unnamed account"]));
  return { space: { ...space, ...profile }, pool: poolRow(pool), page, hasMore: rows.length > 50,
    ledger: rows.slice(0, 50).map((row) => ({ id: row.id, kind: row.kind, delta: row.delta.toString(), balanceAfter: row.balanceAfter.toString(),
      actor: row.actorId ? names.get(row.actorId) ?? "Former account" : "System", reason: row.reason, time: row.createdAt.toISOString() })),
    canManage: can(membership.role, "consumables.manage") && spaceAllows(space.status, "consumables.manage"),
    canConfigureAlerts: can(membership.role, "space.settings") && spaceAllows(space.status, "space.settings"),
    canFinance: can(membership.role, "finance.view") && spaceAllows(space.status, "finance.view"),
    lowStockAlerts: settings?.lowStockAlerts ?? true };
}
