import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";

export async function loadDashboardView() {
  const session = await requireAuth();
  const teams = await prisma.spaceMember.findMany({
    where: { userId: session.user.id, status: "ACTIVE", role: { not: "MEMBER" } },
    orderBy: { space: { name: "asc" } },
    select: { role: true, space: { select: { slug: true, name: true, logoUrl: true, status: true } } },
    take: 50,
  });
  const fullName = session.user.name?.trim() || "there";
  return { firstName: fullName.split(/\s+/)[0], teams: teams.map(({ role, space }) => ({ role, ...space })) };
}
