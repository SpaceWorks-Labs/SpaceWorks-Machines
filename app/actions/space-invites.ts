"use server";

import crypto from "crypto";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { spaceActionAccess } from "@/lib/permissions";
import { assignableRoles } from "@/lib/permissionRoles";
import { createSpaceInviteSchema, revokeSpaceInviteSchema } from "@/lib/validators";
import type { ActionResult } from "./space";
import { flattenZodErrors } from "./utils";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import { enqueueOutbox } from "@/lib/outbox";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const INVITE_DAYS = 7;

/**
 * A single-use invite link for one role. Staff roles need team.manage; maker invites need members.manage
 * (machine managers). With an email, only that verified address may accept and the link is
 * emailed in the space's name.
 */
export async function createSpaceInvite(input: unknown): Promise<ActionResult<{ token: string; inviteId: string; }>> {
  const parsed = createSpaceInviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input.", fieldErrors: flattenZodErrors(parsed.error) };
  const { spaceSlug, role, email } = parsed.data;
  const access = await spaceActionAccess(spaceSlug, role === "MEMBER" ? "members.manage" : "team.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("invite", access.userId)) return { ok: false, error: "Too many invite requests. Try again later." };
  if (!assignableRoles(access.membership.role).includes(role)) return { ok: false, error: "Your role can't invite people with that role." };

  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  const token = crypto.randomBytes(24).toString("base64url");
  const invite = await prisma.$transaction(async (tx) => {
    const created = await tx.spaceInvite.create({ data: { spaceId: access.space.id, token, role, email, createdByUserId: access.userId, expiresAt }, select: { id: true, token: true } });
    await recordAuditEvent({ action: "SPACE_INVITE_CREATED", actorUserId: access.userId, spaceId: access.space.id, targetType: "SpaceInvite", targetId: created.id, metadata: { role, emailed: Boolean(email) }, client: tx });
    if (email) await enqueueOutbox(tx, "member-notice", { to: email, spaceId: access.space.id, notice: "invited", token: created.token, expiresAt: expiresAt.toISOString() });
    return created;
  });
  revalidatePath(`/dashboard/${access.space.slug}/team`);
  return { ok: true, data: { token: invite.token, inviteId: invite.id } };
}

export async function revokeSpaceInvite(input: unknown): Promise<ActionResult> {
  const parsed = revokeSpaceInviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await spaceActionAccess(parsed.data.spaceSlug, "members.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("invite", access.userId)) return { ok: false, error: "Too many invite requests. Try again later." };
  const invite = await prisma.spaceInvite.findFirst({ where: { id: parsed.data.inviteId, spaceId: access.space.id }, select: { id: true, usedAt: true, role: true } });
  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.usedAt) return { ok: false, error: "That invite has already been used." };
  if (!assignableRoles(access.membership.role).includes(invite.role)) return { ok: false, error: "Your role can't revoke that invite." };
  await prisma.spaceInvite.delete({ where: { id: invite.id } });
  await recordAuditEvent({ action: "SPACE_INVITE_REVOKED", actorUserId: access.userId, spaceId: access.space.id, targetType: "SpaceInvite", targetId: invite.id });
  revalidatePath(`/dashboard/${access.space.slug}/team`);
  return { ok: true };
}
