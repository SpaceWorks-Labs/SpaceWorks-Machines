import "server-only";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { invalid, revalidate, refreshMachinePages, slugOf, type Failure } from "@/lib/actionAccess";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { JobGuardError, JobNotFoundError, submitJob } from "@/lib/jobs";
import { PricingInputError, PublicPricingUnavailableError } from "@/lib/pricing";
import { PoolNotFoundError, PoolUnavailableError } from "@/lib/consumables/reservations";
import { InsufficientStockError } from "@/lib/consumables/math";
import { can, isStaffRole } from "@/lib/permissionRoles";
import { submitSchema } from "./actionSchemas";
import type { JobUpload } from "@/lib/files";
import type { ActionResult } from "@/app/actions/space";

export async function requesterAction(input: unknown) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "You must be signed in." };
  const slug = slugOf(input);
  const space = typeof slug === "string" ? await prisma.space.findUnique({ where: { slug } }) : null;
  if (!space) return { ok: false as const, error: "Space not found." };
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.emailVerified) return { ok: false as const, error: "Verify your email before requesting a job." };
  const membership = await prisma.spaceMember.findUnique({ where: { userId_spaceId: { userId: user.id, spaceId: space.id } } });
  if (isStaffRole(membership?.role) && !user.mfaEnabledAt) return { ok: false as const, error: "Set up an authenticator before managing jobs." };
  if (await isActionRateLimited("action", user.id)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return { ok: true as const, space, userId: user.id, membership };
}

export function jobFailure(error: unknown): Failure {
  if (error instanceof PoolNotFoundError) return { ok: false, error: "Space not found." };
  if (error instanceof JobNotFoundError || error instanceof JobGuardError || error instanceof PublicPricingUnavailableError || error instanceof PricingInputError || error instanceof PoolUnavailableError || error instanceof InsufficientStockError) return { ok: false, error: error.message };
  throw error;
}
export function refreshJobs(slug: string) {
  refreshMachinePages(slug);
  revalidate("/account/jobs");
  revalidate("/j/[token]", "page");
}

/** Used by the JSON action and multipart route, so upload submissions pass the same gates. */
export async function submitAction(input: unknown, files: readonly JobUpload[] = []): Promise<ActionResult<{ number: number }>> {
  const access = await requesterAction(input);
  if (!access.ok) return access;
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (parsed.data.requesterEmail && (!access.membership || access.membership.status !== "ACTIVE" || !can(access.membership.role, "jobs.review"))) return { ok: false, error: "Your role doesn't allow this." };
  try {
    const { job } = await submitJob({ ...parsed.data, spaceId: access.space.id, actorId: access.userId, files });
    refreshJobs(access.space.slug);
    return { ok: true, data: { number: job.number } };
  } catch (error) { return jobFailure(error); }
}
