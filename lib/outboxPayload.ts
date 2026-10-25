import type { Prisma } from "@prisma/client";

/** Payload checks shared by outbox handlers. */

export function asRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

export function isEmail(value: unknown): value is string {
  return isBoundedString(value, 320) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isIsoDate(value: unknown): value is string {
  return isBoundedString(value, 64) && !Number.isNaN(Date.parse(value));
}

export function isSafeMessageUrl(value: unknown): value is string {
  if (!isBoundedString(value, 2048)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:");
  } catch {
    return false;
  }
}

export function isExpired(expiresAt: string | undefined, now = new Date()) {
  return expiresAt !== undefined && new Date(expiresAt) <= now;
}

/** Thrown by a handler for a payload or state that can never be delivered; the row is not retried. */
export class PermanentOutboxError extends Error {
  override name = "PermanentOutboxError";
}
