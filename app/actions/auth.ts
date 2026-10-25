"use server";

import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { newPasswordSchema } from "@/lib/passwordPolicy";
import { BREACHED_PASSWORD_MESSAGE, isBreachedPassword } from "@/lib/breachedPassword";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import type { ActionResult } from "./space";
import { flattenZodErrors } from "./utils";
import { issueEmailVerification, verifyEmail } from "@/lib/emailVerification";
import { isNewUserRegistrationEnabled } from "@/lib/instanceSettings";
import { currentRequestBlocked } from "@/lib/ipBlock";
import { issueMagicLink } from "@/lib/magicLink";

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .max(254),
  password: newPasswordSchema,
});

export async function signUpWithPassword(
  input: unknown,
): Promise<ActionResult<{ email: string }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { name, email, password } = parsed.data;
  if (await currentRequestBlocked()) return { ok: false, error: "Too many failed sign-ins from your network. Try again in an hour." };

  if (!(await isNewUserRegistrationEnabled())) {
    return { ok: false, error: "New account creation is currently unavailable." };
  }

  if (await isBreachedPassword(password)) return { ok: false, error: BREACHED_PASSWORD_MESSAGE, fieldErrors: { password: [BREACHED_PASSWORD_MESSAGE] } };
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  if (existing) {
    // Never attach a password based solely on a claimed email address. In
    // particular, doing so lets an attacker take over an account that signs in by emailed link.
    return { ok: true, data: { email } };
  }

  // A double-submit or network retry can arrive just after the first request
  // created the account. Check for that case before consuming the creation
  // quota so a real account creation is never presented as a rate-limit error.
  if (await isActionRateLimited("signup", email)) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, passwordHash },
        select: { id: true, email: true },
      });
      // The signup input is a validated non-null email.
      await issueEmailVerification({ id: user.id, email }, tx);
    });

  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return { ok: true, data: { email } };
  }
  return { ok: true, data: { email } };
}

const verificationTokenSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid verification link."),
});

export async function confirmEmailVerification(input: unknown): Promise<ActionResult<{ verified: true }>> {
  const parsed = verificationTokenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "This verification link is invalid or has expired." };
  if (await isActionRateLimited("auth")) return { ok: false, error: "Too many attempts. Please try again later." };
  const verified = await verifyEmail(parsed.data.token);
  if (!verified) return { ok: false, error: "This verification link is invalid or has expired." };
  return { ok: true, data: { verified: true } };
}

const resendVerificationSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
});

/** Always returns the same success response to avoid account enumeration. */
export async function resendEmailVerification(input: unknown): Promise<ActionResult<{ sent: true }>> {
  const parsed = resendVerificationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid email address.", fieldErrors: flattenZodErrors(parsed.error) };
  }
  const { email } = parsed.data;
  if (await isActionRateLimited("emailVerification", email)) return { ok: true, data: { sent: true } };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, emailVerified: true, passwordHash: true },
  });
  if (!user || user.emailVerified || !user.passwordHash || !user.email) return { ok: true, data: { sent: true } };

  await prisma.$transaction(async (tx) => {
    await issueEmailVerification({ id: user.id, email: user.email! }, tx);
  });
  return { ok: true, data: { sent: true } };
}

const magicLinkSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254) });

/**
 * Email a one-time sign-in link. The answer is the same whether or not the address has an account, and
 * rate limits (per address and per network) fail closed the same way, so nothing can be learnt from it.
 */
export async function requestMagicLink(input: unknown): Promise<ActionResult<{ sent: true }>> {
  const parsed = magicLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address.", fieldErrors: flattenZodErrors(parsed.error) };
  const { email } = parsed.data;
  if ((await currentRequestBlocked()) || (await isActionRateLimited("magicLink", email))) return { ok: true, data: { sent: true } };
  await issueMagicLink(email).catch(() => console.error("[auth] Sign-in link could not be queued"));
  return { ok: true, data: { sent: true } };
}
