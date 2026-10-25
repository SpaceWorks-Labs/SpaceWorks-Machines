import { createHmac, randomBytes } from "node:crypto";

/** `X-SpaceWorks-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">` with the endpoint's secret. */
export function signWebhook(secret: string, body: string, now = new Date()) {
  const t = Math.floor(now.getTime() / 1000);
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

/** Shown once when an endpoint is created or its secret rotated. */
export function newWebhookSecret() {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

/** Retry delays after each failed attempt: 1 min, 5 min, 30 min, 2 h, 12 h; then the delivery fails. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000] as const;
/** Consecutive failed deliveries after which an endpoint is switched off and staff are told. */
export const DISABLE_AFTER_FAILURES = 10;

export function nextAttemptDelay(failedAttempts: number) {
  return failedAttempts >= 1 && failedAttempts <= RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[failedAttempts - 1]! : null;
}
