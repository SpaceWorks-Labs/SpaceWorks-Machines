import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";

/** "My spaces": every space the signed-in person belongs to, as staff or as a maker, with its status. */
export async function loadAccountSpacesView() {
  const session = await requireAuth();
  const rows = await prisma.spaceMember.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { role: true, status: true, createdAt: true, space: { select: { slug: true, name: true, logoUrl: true, status: true, id: true } } },
  });
  const ownedIds = rows.filter((row) => row.role === "MACHINE_MANAGER" && row.status === "ACTIVE").map((row) => row.space.id);
  const ownerCounts = ownedIds.length
    ? await prisma.spaceMember.groupBy({ by: ["spaceId"], where: { spaceId: { in: ownedIds }, role: "MACHINE_MANAGER", status: "ACTIVE" }, _count: { _all: true } })
    : [];
  const soleOwner = new Set(ownerCounts.filter((group) => group._count._all <= 1).map((group) => group.spaceId));
  return {
    spaces: rows.map((row) => ({
      slug: row.space.slug,
      name: row.space.name,
      logoUrl: row.space.logoUrl,
      spaceStatus: row.space.status,
      role: row.role,
      status: row.status,
      joinedAt: row.createdAt,
      soleOwner: soleOwner.has(row.space.id),
    })),
  };
}
