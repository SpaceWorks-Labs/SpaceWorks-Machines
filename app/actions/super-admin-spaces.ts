"use server";

import crypto from "crypto";
import { Prisma, type SpaceStatus } from "@prisma/client";
import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { requireSuperAdmin } from "@/lib/permissions";
import { isReviewDecision, REVIEW_DECISIONS } from "@/lib/spaceLifecycle";
import { applicationSnapshot, notifyOwners, spaceApplicationSchema, releaseHeldSlug } from "@/lib/spaces";
import { enqueueOutbox } from "@/lib/outbox";
import type { ActionResult } from "./space";
import { flattenZodErrors } from "./utils";
import { provisionSpace } from "@/lib/machines/provision";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/** Machine-manager invites from a platform admin last two weeks: long enough for someone to notice the email. */
const OWNER_INVITE_DAYS = 14;

const reviewSchema = z.object({
  spaceId: z.string().trim().min(1).max(64),
  decision: z.string().refine(isReviewDecision, "Unknown decision"),
  reason: z.string().trim().max(2000).optional().transform((value) => value || null),
});

const limitSchema = z.union([z.literal(""), z.null(), z.coerce.number().int().min(1).max(1_000_000)]).transform((value) => (value === "" ? null : value));
const limitsSchema = z.object({
  spaceId: z.string().trim().min(1).max(64),
  memberLimit: limitSchema,
  staffLimit: limitSchema,
});

const createSchema = spaceApplicationSchema.extend({
  ownerEmail: z.string().trim().toLowerCase().email("Enter the owner's email address").max(320),
});


async function superAdmin() {
  const session = await requireSuperAdmin();
  if (await isActionRateLimited("action", session.user.id)) return null;
  return session;
}

const TOO_MANY = { ok: false as const, error: "Too many requests. Try again shortly." };

/** Approve, ask for changes, decline, suspend, reactivate or archive a space. */
export async function reviewSpace(input: unknown): Promise<ActionResult> {
  const session = await superAdmin();
  if (!session) return TOO_MANY;
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid decision.", fieldErrors: flattenZodErrors(parsed.error) };
  const { spaceId, reason } = parsed.data;
  const decision = REVIEW_DECISIONS[parsed.data.decision as keyof typeof REVIEW_DECISIONS];
  if (decision.reasonRequired && !reason) return { ok: false, error: "Add a note for the space.", fieldErrors: { reason: ["The space is told this note"] } };

  const outcome = await prisma.$transaction(async (tx) => {
    // Lock the row: two admins deciding at once, or a resubmission mid-decision, must not interleave.
    const [current] = await tx.$queryRaw<Array<{ status: SpaceStatus; slug: string }>>`SELECT "status", "slug" FROM "Space" WHERE "id" = ${spaceId} FOR UPDATE`;
    if (!current) return { kind: "missing" as const };
    if (!decision.from.includes(current.status)) return { kind: "stale" as const };
    await tx.space.update({ where: { id: spaceId }, data: { status: decision.to } });
    await tx.spaceReview.create({ data: { spaceId, action: decision.action, actorUserId: session.user.id, reason } });
    if (decision.notice) await notifyOwners(tx, spaceId, decision.notice, reason);
    await recordAuditEvent({
      action: `SPACE_${decision.action}`,
      actorUserId: session.user.id,
      spaceId,
      targetType: "Space",
      targetId: spaceId,
      metadata: { from: current.status, to: decision.to },
      client: tx,
    });
    return { kind: "done" as const, slug: current.slug };
  });
  if (outcome.kind === "missing") return { ok: false, error: "Space not found." };
  if (outcome.kind === "stale") return { ok: false, error: "Its status changed while you were looking. Reload and decide again." };
  revalidatePath("/super-admin/spaces");
  revalidatePath(`/super-admin/spaces/${spaceId}`);
  revalidatePath(`/dashboard/${outcome.slug}`, "layout");
  return { ok: true };
}

/** Cap how many makers and staff a space may have. Empty means no cap. */
export async function setSpaceLimits(input: unknown): Promise<ActionResult> {
  const session = await superAdmin();
  if (!session) return TOO_MANY;
  const parsed = limitsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Limits must be whole numbers of at least 1, or empty.", fieldErrors: flattenZodErrors(parsed.error) };
  const { spaceId, memberLimit, staffLimit } = parsed.data;
  const updated = await prisma.space.updateMany({ where: { id: spaceId }, data: { memberLimit, staffLimit } });
  if (updated.count !== 1) return { ok: false, error: "Space not found." };
  await recordAuditEvent({
    action: "SPACE_LIMITS_CHANGED",
    actorUserId: session.user.id,
    spaceId,
    targetType: "Space",
    targetId: spaceId,
    metadata: { memberLimit, staffLimit },
  });
  revalidatePath(`/super-admin/spaces/${spaceId}`);
  return { ok: true };
}

/**
 * Set up an approved space for someone. They become its machine manager by accepting an invite bound to
 * their email address, so a space never has a machine manager who did not agree to it.
 */
export async function createSpaceForOwner(input: unknown): Promise<ActionResult<{ spaceId: string }>> {
  const session = await superAdmin();
  if (!session) return TOO_MANY;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const { ownerEmail, ...application } = parsed.data;

  try {
    const spaceId = await prisma.$transaction(async (tx) => {
      await releaseHeldSlug(tx, application.slug);
      const { slug, ...profile } = application;
      const created = await tx.space.create({
        data: { ...profile, slug, status: "ACTIVE", source: "SUPERADMIN" },
        select: { id: true },
      });
      await provisionSpace(tx, created.id);
      await tx.spaceReview.create({
        data: { spaceId: created.id, action: "CREATED", actorUserId: session.user.id, applicationSnapshot: applicationSnapshot(application) },
      });
      const expiresAt = new Date(Date.now() + OWNER_INVITE_DAYS * 24 * 60 * 60_000);
      const invite = await tx.spaceInvite.create({
        data: { spaceId: created.id, token: crypto.randomBytes(24).toString("base64url"), role: "MACHINE_MANAGER", email: ownerEmail, createdByUserId: session.user.id, expiresAt },
        select: { id: true, token: true },
      });
      await enqueueOutbox(tx, "owner-invite", { to: ownerEmail, spaceId: created.id, token: invite.token, expiresAt: expiresAt.toISOString() });
      await recordAuditEvent({ action: "SPACE_CREATED", actorUserId: session.user.id, spaceId: created.id, targetType: "Space", targetId: created.id, client: tx });
      await recordAuditEvent({ action: "SPACE_INVITE_CREATED", actorUserId: session.user.id, spaceId: created.id, targetType: "SpaceInvite", targetId: invite.id, metadata: { role: "MACHINE_MANAGER" }, client: tx });
      return created.id;
    });
    revalidatePath("/super-admin/spaces");
    return { ok: true, data: { spaceId } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "That web address is taken.", fieldErrors: { slug: ["That web address is taken"] } };
    }
    throw error;
  }
}

/** Send a fresh machine-manager invite when the first expired or went to the wrong inbox. */
export async function resendOwnerInvite(input: unknown): Promise<ActionResult> {
  const session = await superAdmin();
  if (!session) return TOO_MANY;
  const parsed = z.object({ spaceId: z.string().trim().min(1).max(64), ownerEmail: z.string().trim().toLowerCase().email("Enter the owner's email address").max(320) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const { spaceId, ownerEmail } = parsed.data;
  const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { id: true, _count: { select: { members: { where: { role: "MACHINE_MANAGER" } } } } } });
  if (!space) return { ok: false, error: "Space not found." };
  if (space._count.members > 0) return { ok: false, error: "This space already has a machine manager. They can invite others from the Team page." };

  const expiresAt = new Date(Date.now() + OWNER_INVITE_DAYS * 24 * 60 * 60_000);
  await prisma.$transaction(async (tx) => {
    // Only one machine-manager invite stays usable.
    await tx.spaceInvite.deleteMany({ where: { spaceId, role: "MACHINE_MANAGER", usedAt: null } });
    const invite = await tx.spaceInvite.create({
      data: { spaceId, token: crypto.randomBytes(24).toString("base64url"), role: "MACHINE_MANAGER", email: ownerEmail, createdByUserId: session.user.id, expiresAt },
      select: { id: true, token: true },
    });
    await enqueueOutbox(tx, "owner-invite", { to: ownerEmail, spaceId, token: invite.token, expiresAt: expiresAt.toISOString() });
    await recordAuditEvent({ action: "SPACE_INVITE_CREATED", actorUserId: session.user.id, spaceId, targetType: "SpaceInvite", targetId: invite.id, metadata: { role: "MACHINE_MANAGER" }, client: tx });
  });
  revalidatePath(`/super-admin/spaces/${spaceId}`);
  return { ok: true };
}

const visibilitySchema = z.object({ spaceId: z.string().trim().min(1).max(64), visibility: z.enum(["UNLISTED", "PUBLIC"]) });

/** List a space in the public directory (anyone can find it and apply) or take it off. */
export async function setSpaceVisibility(input: unknown): Promise<ActionResult> {
  const session = await superAdmin();
  if (!session) return TOO_MANY;
  const parsed = visibilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const space = await prisma.space.findUnique({ where: { id: parsed.data.spaceId }, select: { status: true, slug: true } });
  if (!space) return { ok: false, error: "Space not found." };
  if (parsed.data.visibility === "PUBLIC" && space.status !== "ACTIVE") return { ok: false, error: "Only an active space can be listed publicly." };
  await prisma.space.update({ where: { id: parsed.data.spaceId }, data: { visibility: parsed.data.visibility } });
  await recordAuditEvent({ action: "SPACE_VISIBILITY_CHANGED", actorUserId: session.user.id, spaceId: parsed.data.spaceId, targetType: "Space", targetId: parsed.data.spaceId, metadata: { visibility: parsed.data.visibility } });
  revalidatePath(`/super-admin/spaces/${parsed.data.spaceId}`);
  revalidatePath("/spaces");
  revalidatePath(`/s/${space.slug}`);
  return { ok: true };
}
