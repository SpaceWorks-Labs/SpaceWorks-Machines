import "server-only";

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { enqueueOutbox } from "@/lib/outbox";
import { absoluteUrl } from "@/lib/email/message";

/**
 * Emailed sign-in links. The raw token exists only in the email; the database keeps its SHA-256 hash under
 * `magic-link:<userId>`. A link lasts 15 minutes and works once; asking again replaces the previous one.
 * Super admins never get one: they sign in with their server-set password only.
 */
export const MAGIC_LINK_TTL_MS = 15 * 60_000;
const PREFIX = "magic-link:";

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const isRawToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

/** Queue a link for this address if it belongs to an ordinary account; silently nothing otherwise. */
export async function issueMagicLink(email: string, now = Date.now()) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, isSuperAdmin: true } });
  if (!user || user.isSuperAdmin) return false;
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(now + MAGIC_LINK_TTL_MS);
  await prisma.$transaction(async (tx) => {
    await tx.verificationToken.deleteMany({ where: { identifier: `${PREFIX}${user.id}` } });
    await tx.verificationToken.create({ data: { identifier: `${PREFIX}${user.id}`, token: sha256(token), expires } });
    await enqueueOutbox(tx, "magic-link", { to: email, url: absoluteUrl(`/login/link?token=${token}`), expiresAt: expires.toISOString() });
  });
  return true;
}

/** The account a live link belongs to, without using it up (so an authenticator step can follow). */
export async function peekMagicLink(token: string, now = new Date()) {
  if (!isRawToken(token)) return null;
  const row = await prisma.verificationToken.findUnique({ where: { token: sha256(token) }, select: { identifier: true, expires: true } });
  if (!row || !row.identifier.startsWith(PREFIX) || row.expires <= now) return null;
  return row.identifier.slice(PREFIX.length);
}

/** Use the link up. True only for the one caller that deletes the live row. */
export async function consumeMagicLink(token: string, userId: string, now = new Date()) {
  if (!isRawToken(token)) return false;
  const used = await prisma.verificationToken.deleteMany({ where: { identifier: `${PREFIX}${userId}`, token: sha256(token), expires: { gt: now } } });
  return used.count === 1;
}
