import { requireSuperAdmin } from "@/lib/permissions";
import { SpaceStatus, OutboxStatus, SpaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { minutesAgo } from "@/lib/superAdminInsights";

export async function loadSuperAdminOverviewView() {
  await requireSuperAdmin();
  const [byStatus, users, spaceMembers, failedEmails, stuckEmails, managersWithoutMfa, unverifiedUsers, staleApplications] = await Promise.all([
    prisma.space.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.count(),
    prisma.spaceMember.count(),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.FAILED } }),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.PENDING, availableAt: { lt: minutesAgo(15) } } }),
    prisma.user.count({ where: { mfaEnabledAt: null, spaceMembers: { some: { role: { in: [SpaceRole.MACHINE_MANAGER] } } } } }),
    prisma.user.count({ where: { emailVerified: null } }),
    prisma.space.count({ where: { status: SpaceStatus.PENDING_REVIEW, updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60_000) } } }),
  ]);
  const statusCount = (status: SpaceStatus) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
  const spaces = byStatus.reduce((sum, row) => sum + row._count._all, 0);

  const activity7d = await prisma.$queryRaw<Array<{ day: string; spaces: bigint; users: bigint }>>`
    with days as (
      select generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') as day
    )
    select
      to_char(d.day, 'Mon DD') as day,
      (select count(*) from "Space" o where date_trunc('day', o."createdAt") = d.day) as spaces,
      (select count(*) from "User" u where date_trunc('day', u."createdAt") = d.day) as users
    from days d
    order by d.day asc
  `.then((rows) => rows.map((row) => ({ day: row.day, spaces: Number(row.spaces), users: Number(row.users) })));

  const recentSpaces = await prisma.space.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, name: true, slug: true, status: true, createdAt: true, _count: { select: { members: true } } },
  });

  const stats = [
    { label: "Active spaces", value: statusCount(SpaceStatus.ACTIVE) },
    { label: "Waiting for review", value: statusCount(SpaceStatus.PENDING_REVIEW) + statusCount(SpaceStatus.CHANGES_REQUESTED) },
    { label: "Users", value: users },
    { label: "Team members", value: spaceMembers },
  ];
  const attention = [
    { label: "Applications waiting over 7 days", value: staleApplications, href: "/super-admin/spaces?status=PENDING_REVIEW" },
    { label: "Suspended spaces", value: statusCount(SpaceStatus.SUSPENDED), href: "/super-admin/spaces?status=SUSPENDED" },
    { label: "Failed emails", value: failedEmails, href: "/super-admin/email" },
    { label: "Emails queued over 15 minutes", value: stuckEmails, href: "/super-admin/email" },
    { label: "Machine managers and admins without MFA", value: managersWithoutMfa, href: "/super-admin/security" },
    { label: "Users with unverified email", value: unverifiedUsers, href: "/super-admin/users?filter=unverified" },
  ];
  return { stats, attention, activity7d, recentSpaces, spaces };
}
