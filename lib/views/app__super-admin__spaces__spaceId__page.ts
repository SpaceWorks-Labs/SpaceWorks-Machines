import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { recordThrottledAuditEvent } from "@/lib/audit";
import { auditRowSelect } from "@/components/super-admin/AuditTable";

type Props = {
  params: Promise<{ spaceId: string }>;
};

export async function loadSuperAdminSpaceDetailView({ params }: Props) {
  // Layout checks don't re-run on client navigation, so every page checks too.
  const session = await requireSuperAdmin();
  const { spaceId } = await params;

  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: {
      id: true, name: true, slug: true, description: true, logoUrl: true, status: true, source: true, joinPolicy: true,
      contactEmail: true, contactPhone: true, addressLine: true, city: true, region: true, postalCode: true, country: true, website: true,
      memberLimit: true, staffLimit: true, visibility: true, createdAt: true, updatedAt: true,
      _count: { select: { members: true } },
    },
  });
  if (!space) notFound();
  // A8: a platform admin opening a space's data is audited (once per half hour per space).
  await recordThrottledAuditEvent({ action: "SUPER_ADMIN_SPACE_VIEWED", actorUserId: session.user.id, spaceId: space.id, targetType: "Space", targetId: space.id, windowMs: 30 * 60_000 }).catch(() => undefined);

  const [reviews, members, invites, assetStats, auditEvents] = await Promise.all([
    prisma.spaceReview.findMany({
      where: { spaceId: space.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, action: true, reason: true, createdAt: true, actor: { select: { name: true, email: true } } },
    }),
    prisma.spaceMember.findMany({
      where: { spaceId: space.id },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, role: true, createdAt: true, user: { select: { id: true, email: true, name: true } } },
    }),
    prisma.spaceInvite.findMany({
      where: { spaceId: space.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, role: true, email: true, createdAt: true, expiresAt: true, usedAt: true, usedBy: { select: { email: true } } },
    }),
    prisma.asset.aggregate({ where: { spaceId: space.id }, _count: { _all: true }, _sum: { byteSize: true } }),
    prisma.auditEvent.findMany({ where: { spaceId: space.id }, orderBy: { createdAt: "desc" }, take: 25, select: auditRowSelect }),
  ]);

  return { space, reviews, members, invites, assetStats, auditEvents, now: new Date() };
}
