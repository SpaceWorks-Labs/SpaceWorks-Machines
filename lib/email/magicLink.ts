import "server-only";

import type { Prisma } from "@prisma/client";
import { isSafeMessageUrl } from "@/lib/outboxPayload";
import { sendBrandedEmail } from "./message";

type MagicLinkPayload = { to: string; url: string; expiresAt: string };

export function asMagicLinkPayload(value: Prisma.JsonValue): MagicLinkPayload | null {
  const p = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!p || typeof p.to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.to) || !isSafeMessageUrl(p.url) || typeof p.expiresAt !== "string" || Number.isNaN(Date.parse(p.expiresAt))) return null;
  return { to: p.to, url: p.url, expiresAt: p.expiresAt };
}

/** A one-time sign-in link. Platform email; the link is a bearer credential and is never logged. */
export async function deliverMagicLink(payload: MagicLinkPayload, messageId: string): Promise<"sent" | "dropped"> {
  if (new Date(payload.expiresAt) <= new Date()) return "dropped";
  await sendBrandedEmail({
    to: payload.to,
    messageId,
    subject: "Your Space Works Machines sign-in link",
    heading: "Sign in to Space Works Machines",
    paragraphs: ["Use this button to sign in. It works once, for 15 minutes, in any browser.", "If you didn't ask for it, you can ignore this email: nobody can sign in without opening it."],
    action: { label: "Sign in", url: payload.url },
    footnote: "Accounts with an authenticator app still ask for its code after the link.",
  });
  return "sent";
}
