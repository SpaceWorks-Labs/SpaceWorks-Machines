import "server-only";

import { prisma } from "@/lib/db";
import { isStaffRole } from "@/lib/permissionRoles";
import { hasSeat } from "@/lib/spaceMembers";
import { queueChatAlerts } from "@/lib/chat/notify";

export type InviteAcceptance =
  | { ok: true; href: string }
  | { ok: false; reason: "unavailable" | "wrong-account" | "full" };

/**
 * Join a space with a single-use invite, in the invite's role. An invite bound to an email (machine-manager invites
 * from the super admin, emailed invites) only works for that verified account. Someone already in the space
 * keeps a more senior role; a pending or blocked maker becomes active.
 */
export async function acceptSpaceInviteToken(token: string, user: { id: string; email: string | null; emailVerified: boolean }): Promise<InviteAcceptance> {
  return prisma.$transaction(async (tx): Promise<InviteAcceptance> => {
    const invite = await tx.spaceInvite.findUnique({
      where: { token },
      select: { id: true, role: true, email: true, spaceId: true, usedAt: true, expiresAt: true, space: { select: { slug: true, memberLimit: true, staffLimit: true } } },
    });
    const now = new Date();
    if (!invite || invite.usedAt || (invite.expiresAt && invite.expiresAt <= now)) return { ok: false, reason: "unavailable" };
    if (invite.email && (!user.emailVerified || !user.email || invite.email.trim().toLowerCase() !== user.email.trim().toLowerCase())) {
      return { ok: false, reason: "wrong-account" };
    }
    await tx.$queryRaw`SELECT "id" FROM "Space" WHERE "id" = ${invite.spaceId} FOR UPDATE`;
    const claim = await tx.spaceInvite.updateMany({
      where: { id: invite.id, usedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      data: { usedAt: now, usedByUserId: user.id },
    });
    if (claim.count !== 1) return { ok: false, reason: "unavailable" };
    const existing = await tx.spaceMember.findUnique({ where: { userId_spaceId: { userId: user.id, spaceId: invite.spaceId } } });
    const upgrade = !existing || (existing.role === "MEMBER" && invite.role !== "MEMBER");
    const changesKind = !existing || isStaffRole(existing.role) !== isStaffRole(invite.role);
    if (upgrade && changesKind && !(await hasSeat(tx, { id: invite.spaceId, ...invite.space }, invite.role))) {
      throw new SeatsFull();
    }
    const role = upgrade ? invite.role : existing!.role;
    const member = await tx.spaceMember.upsert({
      where: { userId_spaceId: { userId: user.id, spaceId: invite.spaceId } },
      create: { userId: user.id, spaceId: invite.spaceId, role, status: "ACTIVE" },
      update: { role, status: "ACTIVE" },
      select: { id: true },
    });
    if (role === "MEMBER" && existing?.status !== "ACTIVE") await queueChatAlerts(tx, invite.spaceId, "member-joined", { memberId: member.id });
    await tx.auditEvent.create({ data: { action: "SPACE_INVITE_ACCEPTED", actorUserId: user.id, spaceId: invite.spaceId, targetType: "SpaceInvite", targetId: invite.id, metadata: { role } } });
    return { ok: true, href: isStaffRole(role) ? `/dashboard/${invite.space.slug}` : `/s/${invite.space.slug}` };
  }).catch((error: unknown) => {
    if (error instanceof SeatsFull) return { ok: false as const, reason: "full" as const };
    throw error;
  });
}

/** Thrown inside the transaction so the invite claim rolls back when the space is full. */
class SeatsFull extends Error {}
