import "server-only";

import crypto from "crypto";

/** Thrown when gateway keys are saved or used without PAYMENT_SECRETS_KEY configured. */
export class PaymentSecretsUnavailable extends Error {
  override name = "PaymentSecretsUnavailable";
  constructor() {
    super("Online payments need PAYMENT_SECRETS_KEY set on the server (32 random bytes, base64).");
  }
}

export function paymentSecretsConfigured() {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

function encryptionKey() {
  const raw = process.env.PAYMENT_SECRETS_KEY ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) throw new PaymentSecretsUnavailable();
  // Domain separation keeps gateway ciphertext from being usable anywhere else the key might be reused.
  return Buffer.from(crypto.hkdfSync("sha256", key, Buffer.alloc(0), "spaceworks-machines-payment-secrets-v1", 32));
}

/** AES-256-GCM, bound to the space so a ciphertext copied to another tenant will not decrypt. */
export function encryptPaymentSecret(value: string, spaceId: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(spaceId, "utf8"));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptPaymentSecret(value: string, spaceId: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted payment secret.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(spaceId, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

/** Last four characters only, for showing which key is saved. */
export function maskSecret(value: string | null | undefined) {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}
