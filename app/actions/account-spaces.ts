"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import type { ActionResult } from "./space";
import { flattenZodErrors } from "./utils";
import { queueChatAlerts } from "@/lib/chat/notify";
import { JOIN_MESSAGES, joinAsMaker } from "@/lib/spaceMembers";
import { isLastActiveManager } from "@/lib/lastManager";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const leaveSpaceSchema = z.object({
  spaceSlug: z.string().trim().min(1).max(100),
});

const NOT_A_MEMBER = "You are not part of this space.";
const SOLE_OWNER_ERROR = "You're the only machine manager. Make someone else a machine manager or delete the space first.";

/**
 * The signed-in person leaves a space (staff or maker), or withdraws a pending request. Only their own row
 * is removed. A blocked maker stays blocked: leaving would let them rejoin on their own.
 *
 * The last-manager check and the delete run in one transaction holding a row
 * lock on the space, so two machine managers leaving at the same time cannot
 * both pass the check and leave the space without one.
 */
export async function leaveSpace(input: unknown): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = leaveSpaceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input.", fieldErrors: flattenZodErrors(parsed.error) };
  }

  if (await isActionRateLimited("action", userId)) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const space = await prisma.space.findUnique({
    where: { slug: parsed.data.spaceSlug },
    select: { id: true, slug: true },
  });
  // Same answer for an unknown slug and a non-member: nothing to leave either way.
  if (!space) return { ok: false, error: NOT_A_MEMBER };

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Space" WHERE "id" = ${space.id} FOR UPDATE`;
    const membership = await tx.spaceMember.findUnique({
      where: { userId_spaceId: { userId, spaceId: space.id } },
      select: { id: true, role: true, status: true },
    });
    if (!membership || membership.status === "BLOCKED") return "not-member" as const;
    if (await isLastActiveManager(tx, space.id, membership.id)) return "sole-owner" as const;
    // Scoped to the caller's own user id as well as the row id.
    const removed = await tx.spaceMember.deleteMany({ where: { id: membership.id, userId, spaceId: space.id } });
    if (removed.count !== 1) return "not-member" as const;
    await recordAuditEvent({
      action: membership.role === "MEMBER" ? "MEMBER_LEFT" : "TEAM_MEMBER_LEFT",
      actorUserId: userId,
      spaceId: space.id,
      targetType: "spaceMember",
      targetId: membership.id,
      metadata: { role: membership.role },
      client: tx,
    });
    if (membership.role === "MEMBER" && membership.status === "ACTIVE") await queueChatAlerts(tx, space.id, "member-left", { memberId: membership.id });
    return "left" as const;
  });

  if (outcome === "not-member") return { ok: false, error: NOT_A_MEMBER };
  if (outcome === "sole-owner") return { ok: false, error: SOLE_OWNER_ERROR };

  revalidatePath("/account");
  revalidatePath(`/s/${space.slug}`);
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/${space.slug}`);
  revalidatePath(`/dashboard/${space.slug}/team`);
  return { ok: true };
}

/** A maker joins a space under its join policy (open, approval or invite only). */
export async function joinSpace(input: unknown): Promise<ActionResult<{ status: "joined" | "requested" }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Sign in to join this space." };
  const parsed = leaveSpaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Space not found." };
  if (await isActionRateLimited("join", userId)) return { ok: false, error: "Too many attempts. Please try again later." };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  if (!user?.emailVerified) return { ok: false, error: "Verify your email address before joining a space." };
  const space = await prisma.space.findUnique({ where: { slug: parsed.data.spaceSlug }, select: { id: true, slug: true } });
  if (!space) return { ok: false, error: "Space not found." };
  const outcome = await prisma.$transaction((tx) => joinAsMaker(tx, userId, space.id));
  if (outcome !== "joined" && outcome !== "requested") return { ok: false, error: JOIN_MESSAGES[outcome] };
  revalidatePath("/account");
  revalidatePath(`/s/${space.slug}`);
  return { ok: true, data: { status: outcome } };
}
