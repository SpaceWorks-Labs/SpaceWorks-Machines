import * as OTPAuth from "otpauth";

/**
 * Authenticator codes for test accounts. The app accepts each 30-second step once per account (and one step
 * either side), so every sign-in takes the next unused step for its secret, waiting when it would run ahead
 * of the clock.
 */
const lastStep = new Map<string, number>();

export async function nextTotp(secret: string) {
  const nowStep = Math.floor(Date.now() / 30_000);
  const step = Math.max((lastStep.get(secret) ?? 0) + 1, nowStep);
  if (step > nowStep + 1) await new Promise((resolve) => setTimeout(resolve, (step - 1) * 30_000 - Date.now() + 1_000));
  lastStep.set(secret, step);
  return new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate({ timestamp: step * 30_000 + 1_000 });
}
