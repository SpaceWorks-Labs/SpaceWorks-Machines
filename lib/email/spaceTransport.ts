import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/db";
import { decryptSpaceSecret } from "@/lib/spaceSecrets";
import { assertPublicHost } from "@/lib/net/publicHost";
import { getEmailTransport } from "./transporter";

type Address = { name: string; address: string };

/** The bare address of a sender written as "Name <address>" or just "address". */
export function senderAddress(from: string) {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
}

/** A transport for the space's own SMTP settings. Throws when the host isn't public. */
export async function spaceSmtpTransport(settings: { smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string | null; password: string | null }) {
  await assertPublicHost(settings.smtpHost);
  const production = process.env.NODE_ENV === "production";
  return nodemailer.createTransport({
    host: settings.smtpHost, port: settings.smtpPort, secure: settings.smtpSecure,
    auth: settings.smtpUser && settings.password ? { user: settings.smtpUser, pass: settings.password } : undefined,
    requireTLS: production && !settings.smtpSecure,
    tls: production ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
    disableFileAccess: true, disableUrlAccess: true,
    connectionTimeout: 30_000, greetingTimeout: 30_000, socketTimeout: 60_000,
  });
}

/**
 * How an email on behalf of a space goes out: through its own SMTP when it has set one up and turned it
 * on, otherwise through the platform's, from the platform address but in the space's name, with replies
 * to the space's contact email.
 */
export async function spaceEmailTransport(spaceId: string): Promise<{ transporter: Transporter | null; from: Address | string; replyTo?: string }> {
  const [settings, space] = await Promise.all([
    prisma.spaceEmailSettings.findUnique({ where: { spaceId } }),
    prisma.space.findUnique({ where: { id: spaceId }, select: { name: true, contactEmail: true } }),
  ]);
  if (settings?.enabled && settings.smtpHost && settings.fromAddress) {
    const password = settings.smtpPasswordEncrypted ? decryptSpaceSecret(settings.smtpPasswordEncrypted, spaceId, "email") : null;
    return {
      transporter: await spaceSmtpTransport({ ...settings, smtpHost: settings.smtpHost, password }),
      from: { name: settings.fromName || space?.name || "", address: settings.fromAddress },
      replyTo: settings.replyTo ?? undefined,
    };
  }
  const platform = await getEmailTransport();
  return {
    transporter: platform.transporter,
    from: space ? { name: space.name, address: senderAddress(platform.from) } : platform.from,
    replyTo: space?.contactEmail ?? undefined,
  };
}
