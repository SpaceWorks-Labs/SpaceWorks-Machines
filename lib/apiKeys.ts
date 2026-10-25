import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordSettingsChange } from "@/lib/audit";
import { checkRateLimitById } from "@/lib/rateLimit";
import { API_SCOPES, type ApiScope } from "@/lib/apiScopes";

export class ApiKeyError extends Error {}
export const MAX_API_KEYS = 25;
const TOKEN = /^swm_([a-f0-9]{12})_([A-Za-z0-9_-]{43})$/;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Issue a key: the token (`swm_<prefix>_<secret>`) is returned once; only its SHA-256 is stored. */
export async function createApiKey(tx: Prisma.TransactionClient, actor: { spaceId: string; actorId: string }, input: { name: string; scopes: string[]; expiresOn?: string | null }) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new ApiKeyError("Name the key after what uses it.");
  const scopes = [...new Set(input.scopes)];
  if (!scopes.length || !scopes.every((scope) => (API_SCOPES as readonly string[]).includes(scope))) throw new ApiKeyError("Choose at least one scope.");
  const expiresAt = input.expiresOn ? new Date(`${input.expiresOn}T23:59:59Z`) : null;
  if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) throw new ApiKeyError("Choose an expiry date in the future.");
  if (await tx.apiKey.count({ where: { spaceId: actor.spaceId, revokedAt: null } }) >= MAX_API_KEYS) throw new ApiKeyError(`A space can have up to ${MAX_API_KEYS} active keys.`);
  const prefix = randomBytes(6).toString("hex");
  const token = `swm_${prefix}_${randomBytes(32).toString("base64url")}`;
  const key = await tx.apiKey.create({ data: { spaceId: actor.spaceId, name, prefix: `swm_${prefix}`, secretHash: hash(token), scopes, expiresAt, createdById: actor.actorId } });
  await recordSettingsChange({ spaceId: actor.spaceId, actorUserId: actor.actorId, area: "integrations.api_keys", fields: ["created"], targetType: "ApiKey", targetId: key.id, client: tx });
  return { key, token };
}

export async function revokeApiKey(tx: Prisma.TransactionClient, actor: { spaceId: string; actorId: string }, keyId: string) {
  const key = await tx.apiKey.findFirst({ where: { spaceId: actor.spaceId, id: keyId, revokedAt: null } });
  if (!key) throw new ApiKeyError("That key is already revoked or doesn't exist.");
  await tx.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  await recordSettingsChange({ spaceId: actor.spaceId, actorUserId: actor.actorId, area: "integrations.api_keys", fields: ["revoked"], targetType: "ApiKey", targetId: key.id, client: tx });
}

export type ApiCaller = { keyId: string; spaceId: string; actorId: string | null; scopes: ApiScope[] };
export type ApiAuthFailure = { status: 401 | 403 | 429; error: string };

/**
 * Resolve the key from `Authorization: Bearer swm_…`. The space comes from the key, never from the URL. Unknown,
 * revoked and expired keys look the same. Reads and writes have their own per-key rate limits.
 */
export async function authenticateApiKey(header: string | null, scope: ApiScope, write: boolean): Promise<ApiCaller | ApiAuthFailure> {
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const match = TOKEN.exec(token);
  const unauthorised = { status: 401 as const, error: "Use a valid API key." };
  if (!match) return unauthorised;
  const key = await prisma.apiKey.findUnique({ where: { prefix: `swm_${match[1]}` }, include: { space: { select: { status: true } } } });
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= new Date())) return unauthorised;
  const expected = Buffer.from(key.secretHash, "hex"), given = Buffer.from(hash(token), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return unauthorised;
  if (key.space.status !== "ACTIVE" && (write || key.space.status !== "SUSPENDED")) return { status: 403, error: "This space isn't active." };
  if (!key.scopes.includes(scope)) return { status: 403, error: `This key lacks the ${scope} scope.` };
  if (!(await checkRateLimitById(write ? "apiWrite" : "apiRead", `key:${key.id}`))) return { status: 429, error: "Too many requests for this key. Slow down." };
  // Last used, at most once a minute per key.
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return { keyId: key.id, spaceId: key.spaceId, actorId: key.createdById, scopes: key.scopes as ApiScope[] };
}
