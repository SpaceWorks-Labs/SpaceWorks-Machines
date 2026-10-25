import "server-only";

import { prisma } from "@/lib/db";
import { decryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";

export const INSTANCE_SETTINGS_ID = "global";

/** A missing singleton row intentionally preserves the historical default. */
export async function isNewUserRegistrationEnabled(): Promise<boolean> {
  const settings = await prisma.instanceSetting.findUnique({
    where: { id: INSTANCE_SETTINGS_ID },
    select: { allowNewUserSignups: true },
  });
  return settings?.allowNewUserSignups ?? true;
}

/** Whether people can apply for a new space at /start. Platform admins can always create one. */
export async function isSpaceApplicationsEnabled(): Promise<boolean> {
  const settings = await prisma.instanceSetting.findUnique({
    where: { id: INSTANCE_SETTINGS_ID },
    select: { allowSpaceApplications: true },
  });
  return settings?.allowSpaceApplications ?? true;
}

export async function getEmailSettings() {
  const settings = await prisma.instanceSetting.findUnique({
    where: { id: INSTANCE_SETTINGS_ID },
    select: {
      emailFrom: true, smtpService: true, smtpHost: true, smtpPort: true,
      smtpSecure: true, smtpUser: true, smtpPasswordEncrypted: true, smtpAllowUnauthenticated: true,
    },
  });
  const configured = Boolean(settings?.smtpService || settings?.smtpHost);
  return {
    from: settings?.emailFrom ?? process.env.EMAIL_FROM ?? "Space Works Machines <noreply@localhost>",
    service: settings?.smtpService ?? process.env.SMTP_SERVICE,
    host: settings?.smtpHost ?? process.env.SMTP_HOST,
    port: settings?.smtpPort ?? parseInt(process.env.SMTP_PORT || "587", 10),
    secure: configured ? settings!.smtpSecure : process.env.SMTP_SECURE === "true",
    user: settings?.smtpUser ?? process.env.SMTP_USER,
    password: settings?.smtpPasswordEncrypted ? decryptInstanceConfigSecret(settings.smtpPasswordEncrypted) : process.env.SMTP_PASSWORD,
    allowUnauthenticated: configured ? settings!.smtpAllowUnauthenticated : process.env.SMTP_ALLOW_UNAUTHENTICATED === "1",
  };
}
