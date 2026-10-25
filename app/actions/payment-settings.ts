"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordSettingsChange } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { spaceActionAccess } from "@/lib/permissions";
import { credentialsOf, ensurePaymentSettings, GATEWAYS, looksLikeTestKey, savePaymentKeys } from "@/lib/payments/config";
import { PaymentSecretsUnavailable } from "@/lib/payments/secrets";
import type { ActionResult } from "./space";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const slug = z.string().trim().min(1).max(64);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((value) => value || null);

/** Payment settings belong to machine managers (payments.settings); every save is audited. */
async function paymentSettingsAccess(spaceSlug: unknown) {
  const access = await spaceActionAccess(spaceSlug, "payments.settings");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return access;
}

function secretsFailure(error: unknown): { ok: false; error: string } {
  if (error instanceof PaymentSecretsUnavailable) return { ok: false, error: error.message };
  throw error;
}

const gatewaySchema = z.object({
  spaceSlug: slug,
  provider: z.enum(["NONE", "RAZORPAY", "STRIPE"]),
  keyId: optionalText(80),
  secret: optionalText(300),
  webhookSecret: optionalText(300),
}).superRefine((value, ctx) => {
  if (value.provider === "RAZORPAY" && value.keyId && !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(value.keyId)) ctx.addIssue({ code: "custom", path: ["keyId"], message: "A Razorpay key id starts with rzp_test_ or rzp_live_" });
  if (value.provider === "STRIPE" && value.secret && !/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(value.secret)) ctx.addIssue({ code: "custom", path: ["secret"], message: "A Stripe secret key starts with sk_ or rk_" });
  if (value.provider === "STRIPE" && value.webhookSecret && !value.webhookSecret.startsWith("whsec_")) ctx.addIssue({ code: "custom", path: ["webhookSecret"], message: "A Stripe signing secret starts with whsec_" });
});

function fieldErrors(error: z.ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), [issue.message]]));
}

/** Choose the gateway and save its keys. Blank secrets keep the saved ones. Test mode follows the key. */
export async function savePaymentGateway(input: unknown): Promise<ActionResult> {
  const parsed = gatewaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const access = await paymentSettingsAccess(parsed.data.spaceSlug);
  if (!access.ok) return access;
  const current = await ensurePaymentSettings(access.space.id);
  const { provider, keyId, secret, webhookSecret } = parsed.data;
  const switching = current.provider !== provider;
  if (provider === "RAZORPAY" && !keyId && (switching || !current.keyId)) return { ok: false, error: "Enter the key id.", fieldErrors: { keyId: ["Required"] } };
  if (provider !== "NONE" && !secret && (switching || !current.secretEncrypted)) return { ok: false, error: "Enter the secret key.", fieldErrors: { secret: ["Required"] } };
  const probe = provider === "RAZORPAY" ? keyId ?? current.keyId ?? "" : secret ?? "";
  try {
    await savePaymentKeys(access.space.id, { provider, keyId, secret, webhookSecret, testMode: probe ? looksLikeTestKey(provider, probe) : current.testMode });
  } catch (error) {
    return secretsFailure(error);
  }
  const fields = ["provider", ...(keyId ? ["keyId"] : []), ...(secret ? ["secret"] : []), ...(webhookSecret ? ["webhookSecret"] : [])];
  await recordSettingsChange({ spaceId: access.space.id, actorUserId: access.userId, area: "space.payments.gateway", fields });
  revalidatePath(`/dashboard/${access.space.slug}/settings/payments`);
  return { ok: true };
}

/** Check the saved keys with the provider and remember when they last worked. */
export async function testPaymentGateway(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ spaceSlug: slug }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const access = await paymentSettingsAccess(parsed.data.spaceSlug);
  if (!access.ok) return access;
  const settings = await ensurePaymentSettings(access.space.id);
  let credentials;
  try {
    credentials = credentialsOf(settings);
  } catch (error) {
    return secretsFailure(error);
  }
  if (settings.provider === "NONE" || !credentials) return { ok: false, error: "Save a gateway and its keys first." };
  const result = await GATEWAYS[settings.provider].testConnection(credentials);
  if (!result.ok) return { ok: false, error: `The provider rejected the keys: ${result.error}` };
  await prisma.spacePaymentSettings.update({ where: { spaceId: access.space.id }, data: { verifiedAt: new Date() } });
  revalidatePath(`/dashboard/${access.space.slug}/settings/payments`);
  return { ok: true };
}

const offlineSchema = z.object({
  spaceSlug: slug,
  upiVpa: optionalText(80).refine((value) => !value || /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,32}$/.test(value), "Enter a UPI ID like space@bank"),
  upiPayeeName: optionalText(80),
  offlineInstructions: z.string().trim().max(1500),
  offlineConfirmationRequired: z.boolean(),
});

/**
 * How makers pay outside the gateway (a UPI ID shown as a QR, bank or cash instructions), and whether an
 * offline payment needs a second person to confirm it (maker-checker).
 */
export async function saveOfflinePaymentSettings(input: unknown): Promise<ActionResult> {
  const parsed = offlineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const access = await paymentSettingsAccess(parsed.data.spaceSlug);
  if (!access.ok) return access;
  await ensurePaymentSettings(access.space.id);
  const { upiVpa, upiPayeeName, offlineInstructions, offlineConfirmationRequired } = parsed.data;
  await prisma.$transaction(async (tx) => {
    await tx.spacePaymentSettings.update({ where: { spaceId: access.space.id }, data: { upiVpa, upiPayeeName, offlineInstructions } });
    await tx.space.update({ where: { id: access.space.id }, data: { offlineConfirmationRequired } });
    await recordSettingsChange({ spaceId: access.space.id, actorUserId: access.userId, area: "space.payments.offline", fields: ["upiVpa", "upiPayeeName", "offlineInstructions", "offlineConfirmationRequired"], client: tx });
  });
  revalidatePath(`/dashboard/${access.space.slug}/settings/payments`);
  return { ok: true };
}
