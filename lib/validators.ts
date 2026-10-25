import { z } from "zod";
import { isReservedSpaceSlug } from "@/lib/slug";
import { isUploadedImageUrl } from "@/lib/uploadUrl";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const spaceSlugSchema = z
  .string()
  .trim()
  .min(2, "The web address must be at least 2 characters")
  .max(64)
  .regex(slugRegex, "Use lowercase letters, numbers and single hyphens")
  .refine((slug) => !isReservedSpaceSlug(slug), "That web address is reserved");

export const updateSpaceSchema = z.object({
  spaceSlug: z.string().trim().min(1),
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(2000).optional().default(""),
  logoUrl: z
    .string()
    .refine(isUploadedImageUrl, "Invalid uploaded image URL")
    .or(z.literal("")),
});

/** Any role; who may hand out which is checked with assignableRoles in lib/permissionRoles.ts. */
export const spaceRoleSchema = z.enum(["MACHINE_MANAGER", "TYPE_MANAGER", "OPERATOR", "TECHNICIAN", "VIEWER", "MEMBER"]);

export const updateSpaceRoleSchema = z.object({
  spaceSlug: z.string().trim().min(1),
  targetUserId: z.string().trim().min(1),
  role: spaceRoleSchema,
});

/** The machine types a machine type manager looks after (replaces the whole set). */
export const typeAssignmentsSchema = z.object({
  spaceSlug: z.string().trim().min(1),
  targetUserId: z.string().trim().min(1),
  typeIds: z.array(z.string().trim().min(1).max(64)).max(200),
});

export const removeSpaceMemberSchema = z.object({
  spaceSlug: z.string().trim().min(1),
  targetUserId: z.string().trim().min(1),
});

export const createSpaceInviteSchema = z.object({
  spaceSlug: z.string().trim().min(1),
  role: spaceRoleSchema.optional().default("MEMBER"),
  /** Optional: only this verified address may accept, and the invite is emailed to it. */
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(320).optional().or(z.literal("")).transform((value) => value || null),
});

export const revokeSpaceInviteSchema = z.object({
  spaceSlug: z.string().trim().min(1),
  inviteId: z.string().trim().min(1),
});

export const deleteSpaceSchema = z.object({
  spaceSlug: z.string().trim().min(1),
});

export const memberDecisionSchema = z.object({
  spaceSlug: z.string().trim().min(1),
  memberId: z.string().trim().min(1).max(64),
  decision: z.enum(["approve", "decline", "block", "unblock"]),
});
