import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { absoluteUrl, sendBrandedEmail } from "./message";

type CodePayload = { to: string; code: string; expiresAt: string };
type AlertPayload = { userId: string; deviceId: string };

const record = (value: Prisma.JsonValue) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;

export function asLoginCodePayload(value: Prisma.JsonValue): CodePayload | null {
  const p = record(value);
  if (!p || typeof p.to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.to) || typeof p.code !== "string" || !/^\d{6}$/.test(p.code) || typeof p.expiresAt !== "string") return null;
  return { to: p.to, code: p.code, expiresAt: p.expiresAt };
}

export function asLoginAlertPayload(value: Prisma.JsonValue): AlertPayload | null {
  const p = record(value);
  return p && isId(p.userId) && isId(p.deviceId) ? { userId: p.userId, deviceId: p.deviceId } : null;
}

/** The six-digit code for a sign-in from a new browser. Platform email; the code is never logged. */
export async function deliverLoginCode(payload: CodePayload, messageId: string): Promise<"sent" | "dropped"> {
  if (new Date(payload.expiresAt) <= new Date()) return "dropped";
  await sendBrandedEmail({
    to: payload.to,
    messageId,
    subject: `Your sign-in code: ${payload.code}`,
    heading: "Your sign-in code",
    paragraphs: [`Enter ${payload.code} to finish signing in from a new browser. It works for 10 minutes.`, "If you didn't try to sign in, someone may know your password. Change it, and don't share this code with anyone."],
    action: { label: "Change your password", url: absoluteUrl("/reset-password") },
  });
  return "sent";
}

/** "New sign-in to your account", with the device, approximate address and time. Platform email. */
export async function deliverLoginAlert(payload: AlertPayload, messageId: string): Promise<"sent" | "dropped"> {
  const device = await prisma.knownDevice.findFirst({ where: { id: payload.deviceId, userId: payload.userId }, select: { label: true, lastIp: true, firstSeenAt: true, user: { select: { email: true, emailVerified: true, isSuperAdmin: true } } } });
  if (!device?.user.email || !device.user.emailVerified) return "dropped";
  const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(device.firstSeenAt);
  await sendBrandedEmail({
    to: device.user.email,
    messageId,
    subject: "New sign-in to your Space Works Machines account",
    heading: "New sign-in",
    paragraphs: [
      `Your account was signed in to from ${device.label}${device.lastIp ? ` (address ${device.lastIp})` : ""} on ${when} UTC.`,
      device.user.isSuperAdmin
        ? "If this wasn't you, change the super-admin password on the server straight away (bash scripts/admin.sh set-password)."
        : "If this was you, there's nothing to do. If it wasn't, change your password now and sign out everywhere from Account, Security.",
    ],
    action: { label: "Review your account security", url: absoluteUrl("/account/security") },
  });
  return "sent";
}
