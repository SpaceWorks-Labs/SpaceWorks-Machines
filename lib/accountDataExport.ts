import "server-only";

import type { SpaceMemberStatus, SpaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Per-collection safety cap. A personal export is the user's own data, so the caps are generous;
 * `truncated` tells the reader when one was reached.
 */
export const ACCOUNT_EXPORT_LIMIT = 2000;

export const ACCOUNT_EXPORT_FORMAT_VERSION = 1;

/* ---------- Raw input shapes (exactly what the loader selects) ---------- */

export type AccountExportSource = {
  user: {
    name: string | null;
    email: string | null;
    emailVerified: Date | null;
    createdAt: Date;
    mfaEnabledAt: Date | null;
  };
  spaceMembers: Array<{ role: SpaceRole; status: SpaceMemberStatus; createdAt: Date; space: { name: string; slug: string } }>;
};

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

/**
 * Shape the export with explicit allow-listed fields only. Never spread a source object: password
 * hashes, MFA seeds, recovery codes and capability tokens must not reach the file.
 * Later phases add the person's jobs and payments here.
 */
export function buildAccountDataExport(source: AccountExportSource, generatedAt: Date = new Date()) {
  const cap = <T,>(list: T[]) => list.slice(0, ACCOUNT_EXPORT_LIMIT);
  return {
    formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
    generatedAt: generatedAt.toISOString(),
    profile: {
      name: source.user.name,
      email: source.user.email,
      emailVerified: Boolean(source.user.emailVerified),
      emailVerifiedAt: iso(source.user.emailVerified),
      accountCreatedAt: source.user.createdAt.toISOString(),
      twoFactorAuthenticationEnabled: Boolean(source.user.mfaEnabledAt),
    },
    spaces: cap(source.spaceMembers).map((row) => ({
      space: row.space.name,
      spaceSlug: row.space.slug,
      role: row.role,
      status: row.status,
      joinedAt: row.createdAt.toISOString(),
    })),
    truncated: {
      spaces: source.spaceMembers.length > ACCOUNT_EXPORT_LIMIT,
    },
  };
}

export type AccountDataExport = ReturnType<typeof buildAccountDataExport>;

/**
 * Load only the signed-in user's own rows. Every query is keyed on `userId` and fetches one row beyond
 * the cap so truncation can be reported. Selects are explicit; no secret column is read.
 */
export async function loadAccountExportSource(userId: string): Promise<AccountExportSource | null> {
  const [user, spaceMembers] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, emailVerified: true, createdAt: true, mfaEnabledAt: true },
    }),
    prisma.spaceMember.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: ACCOUNT_EXPORT_LIMIT + 1,
      select: { role: true, status: true, createdAt: true, space: { select: { name: true, slug: true } } },
    }),
  ]);
  if (!user) return null;
  return { user, spaceMembers };
}
