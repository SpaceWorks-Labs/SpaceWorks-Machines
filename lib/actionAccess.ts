import "server-only";

import { Prisma } from "@prisma/client";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { spaceActionAccess } from "@/lib/permissions";
import type { Capability } from "@/lib/permissionRoles";

export const revalidate = trackedRevalidation(nextRevalidatePath);

export type Failure = { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** spaceActionAccess plus the per-person action rate limit: the gate every machine-side action passes first. */
export async function staffAction(spaceSlug: unknown, capability: Capability) {
  const access = await spaceActionAccess(spaceSlug, capability);
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return access;
}

export function invalid(error: ZodError): Failure {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_root";
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return { ok: false, error: "Check the highlighted fields.", fieldErrors };
}

/** The slug from an action's input object, for the access check before the rest is parsed. */
export function slugOf(input: unknown) {
  return input && typeof input === "object" ? (input as { spaceSlug?: unknown }).spaceSlug : undefined;
}

export function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Refresh every page that shows machines for this space: dashboard areas and the public pages. */
export function refreshMachinePages(slug: string) {
  revalidate(`/dashboard/${slug}`, "layout");
  revalidate(`/s/${slug}`, "layout");
}
