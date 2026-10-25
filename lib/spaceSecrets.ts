import "server-only";

import crypto from "crypto";
import { PaymentSecretsUnavailable } from "@/lib/payments/secrets";

/**
 * Space secrets other than gateway keys (SMTP passwords, chat tokens, webhook signing secrets, printer keys), encrypted with the
 * same PAYMENT_SECRETS_KEY but a key derived per purpose, and bound to the space, so a ciphertext copied
 * to another tenant or another purpose will not decrypt.
 */
export type SpaceSecretPurpose = "email" | "chat" | "webhook" | "printer";

function key(purpose: SpaceSecretPurpose) {
  const raw = process.env.PAYMENT_SECRETS_KEY ?? "";
  const base = Buffer.from(raw, "base64");
  if (base.length !== 32 || base.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) throw new PaymentSecretsUnavailable();
  return Buffer.from(crypto.hkdfSync("sha256", base, Buffer.alloc(0), `spaceworks-machines-${purpose}-secrets-v1`, 32));
}

export function encryptSpaceSecret(value: string, spaceId: string, purpose: SpaceSecretPurpose) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(purpose), iv);
  cipher.setAAD(Buffer.from(`${purpose}:${spaceId}`, "utf8"));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSpaceSecret(value: string, spaceId: string, purpose: SpaceSecretPurpose) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted space secret.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(purpose), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(`${purpose}:${spaceId}`, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
