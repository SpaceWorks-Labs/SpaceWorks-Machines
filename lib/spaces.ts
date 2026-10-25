import "server-only";

import { SpaceStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { spaceSlugSchema } from "@/lib/validators";
import { enqueueOutbox, type OutboxClient } from "@/lib/outbox";
import type { SpaceNotice } from "@/lib/spaceLifecycle";

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);

/** What a space tells the platform when it applies (or what a platform admin enters). */
export const spaceProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter your space's name").max(120),
  description: z.string().trim().min(20, "Tell us a little more: at least a sentence or two").max(2000),
  contactEmail: z.string().trim().toLowerCase().email("Enter a valid email address").max(320),
  contactPhone: optionalText(32).refine((value) => value === null || /^[+0-9 ()-]{6,32}$/.test(value), "Enter a valid phone number"),
  website: optionalText(300).refine((value) => value === null || /^https?:\/\/\S+\.\S+/.test(value), "Enter a full web address starting with https://"),
  addressLine: optionalText(200),
  city: z.string().trim().min(2, "Enter the city").max(80),
  region: optionalText(80),
  postalCode: optionalText(12).refine((value) => value === null || /^[A-Za-z0-9 -]{3,12}$/.test(value), "Enter a valid postal code"),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Enter the two-letter country code, for example IN"),
});

export const spaceApplicationSchema = spaceProfileSchema.extend({ slug: spaceSlugSchema });

export type SpaceProfile = z.infer<typeof spaceProfileSchema>;

/** The application as it stood at a submit, kept on the review row for the reviewer. */
export function applicationSnapshot(profile: SpaceProfile & { slug: string }): Prisma.InputJsonValue {
  return { ...profile, submittedAt: new Date().toISOString() };
}

/** Verified platform admins who should hear about new applications. */
export async function platformAdminEmails(client: OutboxClient): Promise<string[]> {
  const flagged = await client.user.findMany({
    where: { emailVerified: { not: null }, email: { not: null }, isSuperAdmin: true },
    select: { email: true },
    take: 50,
  });
  return [...new Set(flagged.map((user) => user.email!.toLowerCase()))];
}

/** Queue a lifecycle email to every machine manager of a space (within the caller's transaction). */
export async function notifyOwners(client: OutboxClient, spaceId: string, notice: SpaceNotice, reason?: string | null) {
  const owners = await client.spaceMember.findMany({
    where: { spaceId, role: "MACHINE_MANAGER", user: { email: { not: null } } },
    select: { user: { select: { email: true } } },
    take: 20,
  });
  for (const owner of owners) {
    await enqueueOutbox(client, "space-notice", { to: owner.user.email!, spaceId, notice, ...(reason ? { reason } : {}) });
  }
}

/** Tell every platform admin about a new or updated application. */
export async function alertPlatformAdmins(client: OutboxClient, spaceId: string, resubmitted = false) {
  for (const to of await platformAdminEmails(client)) {
    await enqueueOutbox(client, "space-application-alert", { to, spaceId, ...(resubmitted ? { resubmitted: true } : {}) });
  }
}

const SLUG_HOLD_DAYS = 30;

/**
 * A declined application keeps its web address for 30 days, so links in its emails keep working.
 * After that, a new application may take the address: the old record moves to a unique address.
 */
export function isSlugReleasable(holder: { status: SpaceStatus; updatedAt: Date }, now = new Date()) {
  return holder.status === SpaceStatus.REJECTED && now.getTime() - holder.updatedAt.getTime() >= SLUG_HOLD_DAYS * 24 * 60 * 60_000;
}

export async function releaseHeldSlug(client: Prisma.TransactionClient, slug: string, now = new Date()) {
  const holder = await client.space.findUnique({ where: { slug }, select: { id: true, status: true, updatedAt: true } });
  if (!holder || !isSlugReleasable(holder, now)) return false;
  await client.space.update({ where: { id: holder.id }, data: { slug: `declined-${holder.id}` } });
  return true;
}
