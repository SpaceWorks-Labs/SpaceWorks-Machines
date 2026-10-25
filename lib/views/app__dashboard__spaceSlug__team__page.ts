import { prisma } from "@/lib/db";
import { assignableRoles, can, isSpaceManager, STAFF_ROLES, type StaffRole } from "@/lib/permissionRoles";
import { requireSpaceCapability } from "@/lib/permissions";
import { getRequestOrigin } from "@/lib/publicUrl";
import { formatRelativeTime } from "@/lib/format/datetime";
import { EMPTY_ROLE_COUNTS, type RoleCounts, type SpaceMemberRow } from "@/components/team/memberSummary";
import type { MakerRow } from "@/components/team/MakersList";

type Props = { params: Promise<{ spaceSlug: string; }>; searchParams: Promise<{ page?: string; }>; };
const STAFF_LIMIT = 200;
const MAKERS_PAGE_SIZE = 100;
const RECENT_DAYS = 30;
/** Join dates carry no local context; show them in UTC so every viewer sees the same label. */
const DISPLAY_TIME_ZONE = "UTC";
const joinedFormatter = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: DISPLAY_TIME_ZONE });

/** The Team page: staff with their roles, makers (requests first), invite links. Any staff member may read it. */
export async function loadSpaceTeamView({ params, searchParams }: Props) {
  const { spaceSlug } = await params;
  const requestedPage = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);
  const { space, membership } = await requireSpaceCapability(spaceSlug, "space.view");
  const managerView = isSpaceManager(membership.role);
  const canManageMembers = can(membership.role, "members.manage");
  const now = new Date();
  const staffWhere = { spaceId: space.id, role: { not: "MEMBER" as const } };
  const makerWhere = { spaceId: space.id, role: "MEMBER" as const };
  const [profile, staff, roleGroups, makerTotal, pendingCount, recentMakers, types, assignments] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, joinPolicy: true } }),
    prisma.spaceMember.findMany({ where: staffWhere, orderBy: { createdAt: "asc" }, take: STAFF_LIMIT, select: { id: true, userId: true, role: true, createdAt: true, user: { select: { name: true, email: managerView } } } }),
    prisma.spaceMember.groupBy({ by: ["role"], where: staffWhere, _count: { _all: true } }),
    prisma.spaceMember.count({ where: makerWhere }),
    prisma.spaceMember.count({ where: { ...makerWhere, status: "PENDING" } }),
    prisma.spaceMember.count({ where: { ...makerWhere, status: "ACTIVE", createdAt: { gte: new Date(now.getTime() - RECENT_DAYS * 86_400_000) } } }),
    prisma.machineType.findMany({ where: { spaceId: space.id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.typeManagerAssignment.findMany({ where: { spaceId: space.id }, select: { userId: true, machineTypeId: true } }),
  ]);
  const makerPages = Math.max(1, Math.ceil(makerTotal / MAKERS_PAGE_SIZE));
  const makerPage = Math.min(requestedPage, makerPages);
  const makers = await prisma.spaceMember.findMany({
    where: makerWhere,
    // Oldest first; the list itself puts waiting requests at the top.
    orderBy: { createdAt: "asc" },
    skip: (makerPage - 1) * MAKERS_PAGE_SIZE,
    take: MAKERS_PAGE_SIZE,
    select: { id: true, userId: true, status: true, createdAt: true, user: { select: { name: true, email: managerView } } },
  });
  const openInviteWhere = { spaceId: space.id, usedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const invites = managerView
    ? await prisma.spaceInvite.findMany({ where: openInviteWhere, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, token: true, role: true, email: true, createdAt: true } })
    : [];
  const roleCounts: RoleCounts = { ...EMPTY_ROLE_COUNTS };
  for (const group of roleGroups) if ((STAFF_ROLES as readonly string[]).includes(group.role)) roleCounts[group.role as StaffRole] = group._count._all;
  const rows: SpaceMemberRow[] = staff.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    ...(managerView ? { email: m.user.email ?? null } : {}),
    role: m.role,
    joinedLabel: joinedFormatter.format(m.createdAt),
    isYou: m.userId === membership.userId,
    ...(m.role === "TYPE_MANAGER" ? { typeIds: assignments.filter((row) => row.userId === m.userId).map((row) => row.machineTypeId) } : {}),
  }));
  const makerRows: MakerRow[] = makers.map((m) => ({ id: m.id, userId: m.userId, name: m.user.name, email: managerView ? m.user.email ?? null : null, status: m.status, joinedLabel: joinedFormatter.format(m.createdAt) }));
  return {
    space: { ...space, logoUrl: profile.logoUrl, joinPolicy: profile.joinPolicy },
    membership,
    managerView,
    canManageMembers,
    canAssignTypes: can(membership.role, "team.manage"),
    types,
    staffCount: staff.length,
    roleCounts,
    rows,
    makerRows,
    makerTotal,
    makerPage,
    makerPages,
    pendingCount,
    recentMakers,
    baseUrl: await getRequestOrigin(),
    assignable: assignableRoles(membership.role),
    invites: invites.map((invite) => ({ id: invite.id, token: invite.token, role: invite.role, email: invite.email, createdLabel: formatRelativeTime(invite.createdAt, DISPLAY_TIME_ZONE, now) })),
  };
}
