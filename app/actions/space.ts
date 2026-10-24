"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { z } from "zod";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { updateSpaceSchema } from "@/lib/validators";
import { flattenZodErrors } from "./utils";
import { recordSettingsChange } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { isSpaceUploadUrl } from "@/lib/uploadUrl";
import { spaceActionAccess } from "@/lib/permissions";
import { CURRENCIES } from "@/lib/money/currencies";
import { isValidTimeZone } from "@/lib/timeZone";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

export type ActionResult<T = void> =
  | { ok: true; data?: T; }
  | {
    ok: false;
    error: string;
    fieldErrors?: Record<string, string[]>;
    /** The action needs an explicit confirmation to go ahead (for example, overriding a warning). */
    needsForce?: boolean;
  };

/** Space settings: machine managers only, rate limited, and every change audited (lib/audit.ts recordSettingsChange). */
async function settingsAccess(spaceSlug: unknown) {
  const access = await spaceActionAccess(spaceSlug, "space.settings");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return access;
}

function refresh(slug: string) {
  revalidatePath(`/dashboard/${slug}`, "layout");
  revalidatePath(`/s/${slug}`);
}

/** Logo, name and description: how the space appears on its public page. */
export async function updateSpace(input: unknown): Promise<ActionResult> {
  const parsed = updateSpaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await settingsAccess(parsed.data.spaceSlug);
  if (!access.ok) return access;
  const { name, description, logoUrl } = parsed.data;
  if (logoUrl && !isSpaceUploadUrl(logoUrl, access.space.id, "space-logos")) return { ok: false, error: "Choose an uploaded space logo." };
  await prisma.$transaction(async (tx) => {
    await tx.space.update({ where: { id: access.space.id }, data: { name, description: description ?? "", logoUrl: logoUrl || null } });
    await recordSettingsChange({ spaceId: access.space.id, actorUserId: access.userId, area: "space.profile", fields: ["name", "description", "logoUrl"], client: tx });
  });
  refresh(access.space.slug);
  return { ok: true };
}

const optional = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);

const detailsSchema = z.object({
  spaceSlug: z.string().trim().min(1),
  contactEmail: z.string().trim().toLowerCase().email("Enter a valid email address").max(320).or(z.literal("")).transform((value) => value || null),
  contactPhone: optional(32).refine((value) => value === null || /^[+0-9 ()-]{6,32}$/.test(value), "Enter a valid phone number"),
  website: optional(300).refine((value) => value === null || /^https?:\/\/\S+\.\S+/.test(value), "Enter a full web address starting with https://"),
  addressLine: optional(200),
  city: optional(80),
  region: optional(80),
  postalCode: optional(12),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Enter the two-letter country code"),
  timezone: z.string().trim().max(64).refine(isValidTimeZone, "Choose a valid time zone"),
  currency: z.string().refine((value) => Object.hasOwn(CURRENCIES, value), "Choose a supported currency"),
  locale: optional(20).refine((value) => value === null || /^[a-z]{2,3}(-[A-Z]{2})?$/.test(value), "Use a locale such as en-IN"),
});

/** Contact details, address, time zone, currency and number format. */
export async function updateSpaceDetails(input: unknown): Promise<ActionResult> {
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const { spaceSlug, ...data } = parsed.data;
  const access = await settingsAccess(spaceSlug);
  if (!access.ok) return access;
  const before = await prisma.space.findUniqueOrThrow({ where: { id: access.space.id }, select: Object.fromEntries(Object.keys(data).map((key) => [key, true])) as Record<keyof typeof data, true> });
  const changed = (Object.keys(data) as Array<keyof typeof data>).filter((key) => before[key] !== data[key]);
  if (!changed.length) return { ok: true };
  await prisma.$transaction(async (tx) => {
    await tx.space.update({ where: { id: access.space.id }, data });
    await recordSettingsChange({ spaceId: access.space.id, actorUserId: access.userId, area: "space.details", fields: changed, client: tx });
  });
  refresh(access.space.slug);
  return { ok: true };
}

const joinPolicySchema = z.object({ spaceSlug: z.string().trim().min(1), joinPolicy: z.enum(["OPEN", "APPROVAL", "INVITE_ONLY"]) });

/** Who may join as a maker: anyone, anyone with approval, or only people with an invite. */
export async function setJoinPolicy(input: unknown): Promise<ActionResult> {
  const parsed = joinPolicySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose how makers join." };
  const access = await settingsAccess(parsed.data.spaceSlug);
  if (!access.ok) return access;
  await prisma.$transaction(async (tx) => {
    await tx.space.update({ where: { id: access.space.id }, data: { joinPolicy: parsed.data.joinPolicy } });
    await recordSettingsChange({ spaceId: access.space.id, actorUserId: access.userId, area: "space.joining", fields: ["joinPolicy"], client: tx });
  });
  refresh(access.space.slug);
  return { ok: true };
}
