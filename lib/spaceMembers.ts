import "server-only";

import type { JoinPolicy, Prisma, SpaceRole } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { queueChatAlerts } from "@/lib/chat/notify";
import { isStaffRole } from "@/lib/permissionRoles";

type Tx = Prisma.TransactionClient;

/** Whether the space has room for one more person in this role (makers and staff are capped separately). */
export async function hasSeat(tx: Tx, space: { id: string; memberLimit: number | null; staffLimit: number | null }, role: SpaceRole) {
  const staff = isStaffRole(role);
  const limit = staff ? space.staffLimit : space.memberLimit;
  if (limit == null) return true;
  const taken = await tx.spaceMember.count({ where: { spaceId: space.id, ...(staff ? { role: { not: "MEMBER" } } : { role: "MEMBER" }), status: { not: "BLOCKED" } } });
  return taken < limit;
}

export type JoinOutcome = "joined" | "requested" | "already" | "blocked" | "invite-only" | "full" | "unavailable";

/**
 * A signed-in person asks to join a space as a maker. OPEN joins at once, APPROVAL waits as PENDING for a
 * machine manager, INVITE_ONLY refuses (invites go through acceptSpaceInviteToken). Runs inside the caller's
 * transaction, which holds a row lock on the space so limits can't be overrun by a burst of joins.
 */
export async function joinAsMaker(tx: Tx, userId: string, spaceId: string): Promise<JoinOutcome> {
  const [space] = await tx.$queryRaw<Array<{ id: string; status: string; joinPolicy: JoinPolicy; memberLimit: number | null; staffLimit: number | null }>>`
    SELECT "id", "status", "joinPolicy", "memberLimit", "staffLimit" FROM "Space" WHERE "id" = ${spaceId} FOR UPDATE`;
  if (!space || space.status !== "ACTIVE") return "unavailable";
  const existing = await tx.spaceMember.findUnique({ where: { userId_spaceId: { userId, spaceId } }, select: { status: true } });
  if (existing?.status === "BLOCKED") return "blocked";
  if (existing) return "already";
  if (space.joinPolicy === "INVITE_ONLY") return "invite-only";
  if (!(await hasSeat(tx, space, "MEMBER"))) return "full";
  const status = space.joinPolicy === "OPEN" ? "ACTIVE" : "PENDING";
  const member = await tx.spaceMember.create({ data: { userId, spaceId, role: "MEMBER", status }, select: { id: true } });
  await recordAuditEvent({ action: status === "ACTIVE" ? "MEMBER_JOINED" : "MEMBER_JOIN_REQUESTED", actorUserId: userId, spaceId, targetType: "SpaceMember", targetId: member.id, client: tx });
  await queueChatAlerts(tx, spaceId, status === "ACTIVE" ? "member-joined" : "join-request", { memberId: member.id });
  return status === "ACTIVE" ? "joined" : "requested";
}

export const JOIN_MESSAGES: Record<Exclude<JoinOutcome, "joined" | "requested">, string> = {
  already: "You're already part of this space.",
  blocked: "You can't join this space. Ask the space if you think this is a mistake.",
  "invite-only": "This space takes makers by invite only.",
  full: "This space isn't taking new makers right now.",
  unavailable: "This space isn't taking new makers right now.",
};
