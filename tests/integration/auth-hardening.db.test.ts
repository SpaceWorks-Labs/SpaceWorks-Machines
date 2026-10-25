import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const identity = vi.hoisted(() => ({ id: "", email: "" }));
vi.mock("@/lib/permissions", () => ({ requireAuth: async () => ({ user: identity }) }));
vi.mock("@/lib/reauth", () => ({ hasRecentAuthentication: async () => true }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/outbox", () => ({ enqueuePasswordReset: vi.fn() }));
import { confirmPasswordReset } from "@/app/actions/password-reset";
import { updateAccountPassword } from "@/app/actions/account";
import { prisma } from "@/lib/db";
import { consumeMfaCode, createMfaEnrollment, encryptMfaSecret } from "@/lib/mfa";
import { confirmMfaEnrollment } from "@/app/actions/security";
const suffix = randomUUID();
const enrollment = createMfaEnrollment("test@example.test");
const otp = OTPAuth.URI.parse(enrollment.uri);
beforeAll(async () => {
  process.env.AUTH_SECRET = "integration-auth-secret-with-at-least-32-characters";
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const user = await prisma.user.create({ data: { email: `auth-${suffix}@example.test`, emailVerified: new Date() } });
  identity.id = user.id;
  identity.email = user.email!;
});
afterAll(async () => {
  await prisma.verificationToken.deleteMany({ where: { identifier: { in: [`mfa:${identity.id}`, `reset:${identity.email}`] } } });
  await prisma.user.deleteMany({ where: { id: identity.id } });
  await prisma.$disconnect();
});
describe.sequential("auth concurrency", () => {
  it("accepts exactly one simultaneous use of a TOTP across replicas", async () => {
    const code = otp.generate();
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeMfaCode(enrollment.secret, identity.email, code)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it("enables an enrollment once under concurrent confirmation", async () => {
    await prisma.verificationToken.create({ data: {
      identifier: `mfa:${identity.id}`,
      token: encryptMfaSecret(JSON.stringify({ secret: enrollment.secret, sessionVersion: 0 })),
      expires: new Date(Date.now() + 60_000),
    } });
    const results = await Promise.all([confirmMfaEnrollment({ code: otp.generate() }), confirmMfaEnrollment({ code: otp.generate() })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: identity.id } });
    expect(user.sessionVersion).toBe(1);
    expect(user.recoveryCodeHashes).toHaveLength(10);
  });
  it("rejects pending setup from before session revocation", async () => {
    await prisma.user.update({ where: { id: identity.id }, data: { mfaSecretEncrypted: null, mfaEnabledAt: null, sessionVersion: 2 } });
    await prisma.verificationToken.create({ data: {
      identifier: `mfa:${identity.id}`,
      token: encryptMfaSecret(JSON.stringify({ secret: enrollment.secret, sessionVersion: 1 })),
      expires: new Date(Date.now() + 60_000),
    } });
    expect((await confirmMfaEnrollment({ code: otp.generate() })).ok).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: identity.id } })).mfaSecretEncrypted).toBeNull();
  });
  it("serializes password recovery against a concurrent password change", async () => {
    await prisma.user.update({ where: { id: identity.id }, data: { passwordHash: await bcrypt.hash("original-password", 12) } });
    const token = randomBytes(32).toString("hex");
    await prisma.verificationToken.create({ data: { identifier: `reset:${identity.email}`, token: createHash("sha256").update(token).digest("hex"), expires: new Date(Date.now() + 60_000) } });
    const results = await Promise.all([
      confirmPasswordReset({ email: identity.email, token, password: "recovered-password" }),
      updateAccountPassword({ currentPassword: "original-password", newPassword: "changed-password", confirmPassword: "changed-password" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.verificationToken.count({ where: { identifier: `reset:${identity.email}` } })).toBe(0);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: identity.id } });
    expect(await bcrypt.compare(results[0].ok ? "recovered-password" : "changed-password", user.passwordHash!)).toBe(true);
  });

});
