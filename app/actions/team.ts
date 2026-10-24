"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canDeleteSpace, getMembership, hasAuthenticator, spaceActionAccess, STAFF_AUTHENTICATOR_MESSAGE } from "@/lib/permissions";
import { assignableRoles, canManageTeamMember, isStaffRole } from "@/lib/permissionRoles";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { deleteSpaceSchema, memberDecisionSchema, removeSpaceMemberSchema, typeAssignmentsSchema, updateSpaceRoleSchema } from "@/lib/validators";
import type { ActionResult } from "./space";
import { flattenZodErrors } from "./utils";
import { canDeleteInStatus } from "@/lib/spaceLifecycle";
import { recordAuditEvent } from "@/lib/audit";
import { hasRecentAuthentication } from "@/lib/reauth";
import { enqueueOutbox } from "@/lib/outbox";
import { queueChatAlerts } from "@/lib/chat/notify";
import { hasSeat } from "@/lib/spaceMembers";
import { isLastActiveManager, LAST_MANAGER_MESSAGE } from "@/lib/lastManager";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const DECISION_ACTIONS = { approve: "MEMBER_APPROVED", decline: "MEMBER_DECLINED", block: "MEMBER_BLOCKED", unblock: "MEMBER_UNBLOCKED" } as const;
const TOO_MANY = { ok: false as const, error: "Too many requests. Try again shortly." };

function refreshTeam(slug: string) {
  revalidatePath(`/dashboard/${slug}/team`);
  revalidatePath(`/dashboard/${slug}`);
}

/**
 * Change someone's role (machine managers only). The last active machine manager can't be demoted. Promoting a
 * maker to staff counts against the staff limit.
 */
export async function updateSpaceRole(input: unknown): Promise<ActionResult> {
  const parsed = updateSpaceRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await spaceActionAccess(parsed.data.spaceSlug, "team.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return TOO_MANY;
  if (!(await hasRecentAuthentication())) return { ok: false, error: "For security, sign in again before changing roles." };
  const { targetUserId, role } = parsed.data;
  if (targetUserId === access.userId) return { ok: false, error: "You can't change your own role." };

  const outcome = await prisma.$transaction(async (tx) => {
    const [space] = await tx.$queryRaw<Array<{ id: string; memberLimit: number | null; staffLimit: number | null }>>`
      SELECT "id", "memberLimit", "staffLimit" FROM "Space" WHERE "id" = ${access.space.id} FOR UPDATE`;
    const target = await tx.spaceMember.findUnique({ where: { userId_spaceId: { userId: targetUserId, spaceId: access.space.id } } });
    if (!target || target.status !== "ACTIVE") return "missing" as const;
    if (!canManageTeamMember(access.membership.role, target.role) || !assignableRoles(access.membership.role).includes(role)) return "forbidden" as const;
    if (target.role === role) return "done" as const;
    if (role !== "MACHINE_MANAGER" && await isLastActiveManager(tx, access.space.id, target.id)) return "last" as const;
    if (isStaffRole(role) !== isStaffRole(target.role) && !(await hasSeat(tx, space, role))) return "full" as const;
    await tx.spaceMember.update({ where: { id: target.id }, data: { role } });
    // Type assignments only mean something to a machine type manager; a new role starts without them.
    if (target.role === "TYPE_MANAGER") await tx.typeManagerAssignment.deleteMany({ where: { spaceId: access.space.id, userId: targetUserId } });
    await recordAuditEvent({ action: "TEAM_ROLE_CHANGED", actorUserId: access.userId, spaceId: access.space.id, targetType: "SpaceMember", targetId: target.id, metadata: { from: target.role, to: role }, client: tx });
    return "done" as const;
  });
  if (outcome === "missing") return { ok: false, error: "That person isn't active in this space." };
  if (outcome === "forbidden") return { ok: false, error: "Your role can't give or change that role." };
  if (outcome === "full") return { ok: false, error: "This space has reached its limit for that kind of role." };
  if (outcome === "last") return { ok: false, error: LAST_MANAGER_MESSAGE };
  refreshTeam(access.space.slug);
  return { ok: true };
}

/**
 * Set the machine types a machine type manager looks after (machine managers only, audited). They get full access
 * and settings for exactly these types; everything else in the space answers not found to them.
 */
export async function setTypeAssignmentsAction(input: unknown): Promise<ActionResult> {
  const parsed = typeAssignmentsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await spaceActionAccess(parsed.data.spaceSlug, "team.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return TOO_MANY;
  const { targetUserId } = parsed.data;
  const typeIds = [...new Set(parsed.data.typeIds)];
  const outcome = await prisma.$transaction(async (tx) => {
    const target = await tx.spaceMember.findUnique({ where: { userId_spaceId: { userId: targetUserId, spaceId: access.space.id } } });
    if (!target || target.status !== "ACTIVE" || target.role !== "TYPE_MANAGER") return "missing" as const;
    if (await tx.machineType.count({ where: { spaceId: access.space.id, id: { in: typeIds } } }) !== typeIds.length) return "types" as const;
    const before = (await tx.typeManagerAssignment.findMany({ where: { spaceId: access.space.id, userId: targetUserId }, select: { machineTypeId: true } })).map((row) => row.machineTypeId);
    await tx.typeManagerAssignment.deleteMany({ where: { spaceId: access.space.id, userId: targetUserId, machineTypeId: { notIn: typeIds } } });
    await tx.typeManagerAssignment.createMany({ data: typeIds.filter((id) => !before.includes(id)).map((machineTypeId) => ({ spaceId: access.space.id, machineTypeId, userId: targetUserId, createdById: access.userId })) });
    await recordAuditEvent({ action: "TEAM_TYPES_ASSIGNED", actorUserId: access.userId, spaceId: access.space.id, targetType: "SpaceMember", targetId: target.id,
      metadata: { added: typeIds.filter((id) => !before.includes(id)).join(","), removed: before.filter((id) => !typeIds.includes(id)).join(",") }, client: tx });
    return "done" as const;
  });
  if (outcome === "missing") return { ok: false, error: "That person isn't an active machine type manager here." };
  if (outcome === "types") return { ok: false, error: "One of those machine types no longer exists. Reload and try again." };
  refreshTeam(access.space.slug);
  return { ok: true };
}

/** Remove someone from the space: staff need team.manage, makers members.manage. Never the last machine manager. */
export async function removeSpaceMember(input: unknown): Promise<ActionResult> {
  const parsed = removeSpaceMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input.", fieldErrors: flattenZodErrors(parsed.error) };
  const session = await auth();
  if (parsed.data.targetUserId === session?.user?.id) return { ok: false, error: "You can't remove yourself this way. Leave the space from your account instead." };
  const probe = await spaceActionAccess(parsed.data.spaceSlug, "space.view");
  if (!probe.ok) return probe;
  const target = await getMembership(parsed.data.targetUserId, probe.space.id);
  if (!target) return { ok: false, error: "That person isn't in this space." };
  const access = await spaceActionAccess(parsed.data.spaceSlug, target.role === "MEMBER" ? "members.manage" : "team.manage");
  if (!access.ok) return access;
  if (!canManageTeamMember(access.membership.role, target.role)) return { ok: false, error: "Your role can't remove this person." };
  const removed = await prisma.$transaction(async (tx) => {
    if (await isLastActiveManager(tx, access.space.id, target.id)) return false;
    await tx.spaceMember.delete({ where: { id: target.id } });
    await recordAuditEvent({ action: "TEAM_MEMBER_REMOVED", actorUserId: access.userId, spaceId: access.space.id, targetType: "SpaceMember", targetId: target.id, metadata: { role: target.role }, client: tx });
    return true;
  });
  if (!removed) return { ok: false, error: LAST_MANAGER_MESSAGE };
  refreshTeam(access.space.slug);
  return { ok: true };
}

/**
 * Machine managers decide on makers: approve or decline a pending request, block a maker (they can't rejoin
 * on their own) or unblock them. Approvals and declines are emailed in the space's name.
 */
export async function decideMember(input: unknown): Promise<ActionResult> {
  const parsed = memberDecisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const access = await spaceActionAccess(parsed.data.spaceSlug, "members.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return TOO_MANY;
  const { memberId, decision } = parsed.data;
  const outcome = await prisma.$transaction(async (tx) => {
    const member = await tx.spaceMember.findFirst({ where: { id: memberId, spaceId: access.space.id, role: "MEMBER" }, select: { id: true, status: true, user: { select: { email: true } } } });
    if (!member) return "missing" as const;
    const expected = decision === "approve" || decision === "decline" ? "PENDING" : decision === "unblock" ? "BLOCKED" : null;
    if (expected && member.status !== expected) return "stale" as const;
    if (decision === "decline") await tx.spaceMember.delete({ where: { id: member.id } });
    else await tx.spaceMember.update({ where: { id: member.id }, data: { status: decision === "block" ? "BLOCKED" : "ACTIVE" } });
    await recordAuditEvent({ action: DECISION_ACTIONS[decision], actorUserId: access.userId, spaceId: access.space.id, targetType: "SpaceMember", targetId: member.id, client: tx });
    if ((decision === "approve" || decision === "decline") && member.user.email) {
      await enqueueOutbox(tx, "member-notice", { to: member.user.email, spaceId: access.space.id, notice: decision === "approve" ? "approved" : "declined" });
    }
    if (decision === "approve") await queueChatAlerts(tx, access.space.id, "member-joined", { memberId: member.id });
    return "done" as const;
  });
  if (outcome === "missing") return { ok: false, error: "That maker isn't in this space." };
  if (outcome === "stale") return { ok: false, error: "That request changed while you were looking. Reload and try again." };
  refreshTeam(access.space.slug);
  return { ok: true };
}

export async function deleteSpace(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };
  const parsed = deleteSpaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input.", fieldErrors: flattenZodErrors(parsed.error) };
  const space = await prisma.space.findUnique({ where: { slug: parsed.data.spaceSlug } });
  if (!space) return { ok: false, error: "Space not found." };
  if (!canDeleteInStatus(space.status)) return { ok: false, error: "A suspended or archived space keeps its records and can't be deleted." };
  const membership = await getMembership(session.user.id, space.id);
  if (!membership || membership.status !== "ACTIVE" || !canDeleteSpace(membership)) return { ok: false, error: "Only a machine manager can delete the space." };
  if (!(await hasAuthenticator(session.user.id))) return { ok: false, error: STAFF_AUTHENTICATOR_MESSAGE };
  if (!(await hasRecentAuthentication())) return { ok: false, error: "For security, sign in again before deleting a space." };
  // Deliberately omit spaceId: deleting the space cascades its scoped records, while this audit record
  // must survive at the instance level. Phase 3 adds a "has taken payments, archive instead" guard.
  await recordAuditEvent({ action: "SPACE_DELETED", actorUserId: session.user.id, targetType: "Space", targetId: space.id });
  await prisma.space.delete({ where: { id: space.id } });
  revalidatePath("/dashboard");
  revalidatePath(`/s/${space.slug}`);
  return { ok: true };
}
