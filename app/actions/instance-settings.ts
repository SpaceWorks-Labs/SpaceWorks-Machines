"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { requireSuperAdmin } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";
import { encryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import type { ActionResult } from "./space";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const signupSettingSchema = z.object({ allowNewUserSignups: z.boolean() });
const serviceSettingsSchema = z.object({
  emailFrom: z.string().trim().max(320).optional(),
  smtpService: z.string().trim().max(120).optional(), smtpHost: z.string().trim().max(253).optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(), smtpSecure: z.boolean(),
  smtpUser: z.string().trim().max(320).optional(), smtpPassword: z.string().max(1024).optional(), smtpAllowUnauthenticated: z.boolean(),
  backupProvider: z.string().trim().max(80).optional(), backupLastSuccessAt: z.string().datetime().optional(),
  backupRetentionDays: z.coerce.number().int().min(1).max(3650).optional(),
}).superRefine((value, ctx) => {
  if (value.smtpService && value.smtpHost) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["smtpHost"], message: "Choose either an SMTP service or a host." });
  if ((value.smtpService || value.smtpHost) && !value.smtpAllowUnauthenticated && !value.smtpUser) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["smtpUser"], message: "SMTP credentials are required unless using a private relay." });
});

export async function setNewUserRegistrationEnabled(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = signupSettingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid account creation setting." };

  await prisma.instanceSetting.upsert({
    where: { id: INSTANCE_SETTINGS_ID },
    create: { id: INSTANCE_SETTINGS_ID, allowNewUserSignups: parsed.data.allowNewUserSignups },
    update: { allowNewUserSignups: parsed.data.allowNewUserSignups },
  });
  await recordAuditEvent({
    action: "NEW_USER_REGISTRATION_SETTING_UPDATED",
    actorUserId: session.user.id,
    targetType: "InstanceSetting",
    targetId: INSTANCE_SETTINGS_ID,
    metadata: { allowNewUserSignups: parsed.data.allowNewUserSignups },
  });
  revalidatePath("/login");
  revalidatePath("/super-admin/auth");
  return { ok: true };
}

const applicationsSettingSchema = z.object({ allowSpaceApplications: z.boolean() });

/** Open or close self-service space applications at /start. */
export async function setSpaceApplicationsEnabled(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = applicationsSettingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid application setting." };
  const { allowSpaceApplications } = parsed.data;
  await prisma.instanceSetting.upsert({
    where: { id: INSTANCE_SETTINGS_ID },
    create: { id: INSTANCE_SETTINGS_ID, allowSpaceApplications },
    update: { allowSpaceApplications },
  });
  await recordAuditEvent({
    action: "SPACE_APPLICATIONS_SETTING_UPDATED",
    actorUserId: session.user.id,
    targetType: "InstanceSetting",
    targetId: INSTANCE_SETTINGS_ID,
    metadata: { allowSpaceApplications },
  });
  revalidatePath("/start");
  revalidatePath("/super-admin/spaces");
  return { ok: true };
}

export async function saveInstanceServiceSettings(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = serviceSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid instance settings." };
  const { smtpPassword, ...value } = parsed.data;
  const existing = await prisma.instanceSetting.findUnique({
    where: { id: INSTANCE_SETTINGS_ID },
    select: { smtpPasswordEncrypted: true },
  });
  if ((value.smtpService || value.smtpHost) && !value.smtpAllowUnauthenticated && !smtpPassword && !existing?.smtpPasswordEncrypted) {
    return { ok: false, error: "Enter an SMTP password or use a deliberately unauthenticated private relay." };
  }
  await prisma.instanceSetting.upsert({
    where: { id: INSTANCE_SETTINGS_ID },
    create: {
      id: INSTANCE_SETTINGS_ID, ...value,
      emailFrom: value.emailFrom || null, smtpService: value.smtpService || null, smtpHost: value.smtpHost || null,
      smtpUser: value.smtpUser || null,
      backupProvider: value.backupProvider || null, backupLastSuccessAt: value.backupLastSuccessAt ? new Date(value.backupLastSuccessAt) : null,
      smtpPasswordEncrypted: smtpPassword ? encryptInstanceConfigSecret(smtpPassword) : null,
    },
    update: {
      ...value, emailFrom: value.emailFrom || null, smtpService: value.smtpService || null, smtpHost: value.smtpHost || null,
      smtpUser: value.smtpUser || null,
      backupProvider: value.backupProvider || null, backupLastSuccessAt: value.backupLastSuccessAt ? new Date(value.backupLastSuccessAt) : null,
      ...(smtpPassword ? { smtpPasswordEncrypted: encryptInstanceConfigSecret(smtpPassword) } : {}),
    },
  });
  await recordAuditEvent({
    action: "INSTANCE_SERVICE_SETTINGS_UPDATED", actorUserId: session.user.id, targetType: "InstanceSetting", targetId: INSTANCE_SETTINGS_ID,
    metadata: { smtpConfigured: Boolean(value.smtpService || value.smtpHost), backupConfigured: Boolean(value.backupProvider) },
  });
  revalidatePath("/login");
  revalidatePath("/super-admin/settings");
  revalidatePath("/super-admin/operations");
  return { ok: true };
}
