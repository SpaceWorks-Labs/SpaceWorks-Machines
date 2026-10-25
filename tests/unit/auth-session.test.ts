import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthConfig } from "next-auth";
import type { CredentialsConfig } from "next-auth/providers/credentials";

const mocks = vi.hoisted(() => ({ config: null as unknown, find: vi.fn(), update: vi.fn(), compare: vi.fn(), limit: vi.fn(), consume: vi.fn(), recovery: vi.fn(), peek: vi.fn(), consumeLink: vi.fn() }));
vi.mock("next-auth", () => ({
  default: (config: unknown) => { mocks.config = config; return {}; },
  CredentialsSignin: class extends Error {},
}));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));
vi.mock("@/lib/loginSecurity", () => ({ recognisedDevice: async () => ({ id: "device_1" }), rememberDevice: async () => undefined, issueLoginCode: async () => undefined, consumeLoginCode: async () => true, justVerified: () => true }));
vi.mock("@/lib/ipBlock", () => ({ isIpBlocked: async () => false, recordFailedLogin: async () => false }));
vi.mock("@/lib/rateLimit", () => ({ getClientIpFromHeaders: () => "203.0.113.7" }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: mocks.find, update: mocks.update } } }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.limit }));
vi.mock("@/lib/mfa", () => ({ consumeMfaCode: mocks.consume, consumeRecoveryCode: mocks.recovery, decryptMfaSecret: () => "synthetic-seed" }));
vi.mock("@/lib/magicLink", () => ({ peekMagicLink: mocks.peek, consumeMagicLink: mocks.consumeLink }));
import "@/lib/auth";
let config: NextAuthConfig;
beforeEach(async () => {
  vi.clearAllMocks();
  config = mocks.config as NextAuthConfig;
  mocks.limit.mockResolvedValue(false);
  mocks.compare.mockResolvedValue(true);
  mocks.find.mockResolvedValue({ id: "user_1", email: "person@example.test", emailVerified: new Date(), passwordHash: "hash", sessionVersion: 2 });
  mocks.peek.mockResolvedValue("user_1");
  mocks.consumeLink.mockResolvedValue(true);
});
const jwt = (args: unknown) => config.callbacks!.jwt!(args as Parameters<NonNullable<NonNullable<NextAuthConfig["callbacks"]>["jwt"]>>[0]);
const authorize = (raw: Record<string, string>, index = 0) => {
  const provider = config.providers[index] as CredentialsConfig;
  return provider.authorize(raw, new Request("https://example.test/api/auth/callback/credentials"));
};
const TOKEN = "a".repeat(43);
describe("authentication boundary", () => {
  it("limits the normalized account before reading or hashing", async () => {
    mocks.limit.mockResolvedValue(true);
    expect(await authorize({ email: " PERSON@example.test ", password: "password" })).toBeNull();
    expect(mocks.limit).toHaveBeenCalledWith("auth", "person@example.test");
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
  });
  it("performs dummy password work for missing identities", async () => {
    mocks.find.mockResolvedValue(null);
    expect(await authorize({ email: "person@example.test", password: "password" })).toBeNull();
    expect(mocks.compare).toHaveBeenCalledOnce();
  });
  it("rejects oversized credentials before expensive work", async () => {
    expect(await authorize({ email: "person@example.test", password: "a".repeat(129) })).toBeNull();
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("binds successful password proof to its session version", async () => {
    expect(await authorize({ email: "person@example.test", password: "password" })).toMatchObject({ id: "user_1", sessionVersion: 2 });
  });
  it("rejects a login racing credential revocation", async () => {
    expect(await jwt({ token: {}, user: { id: "user_1", sessionVersion: 1 } })).toBeNull();
  });
  it.each([{}, { sessionVersion: 1 }, { sessionVersion: 2, sessionRevoked: true }])("clears stale sessions %j", async (token) => {
    expect(await jwt({ token: { sub: "user_1", ...token } })).toBeNull();
  });
  it("does not let session updates renew authentication freshness", async () => {
    const token = { sub: "user_1", sessionVersion: 2, authenticatedAt: 123 };
    expect(await jwt({ token, trigger: "update", session: { authenticatedAt: Date.now(), sessionVersion: 99 } })).toEqual(token);
  });
  it("clears deleted users", async () => {
    mocks.find.mockResolvedValue(null);
    expect(await jwt({ token: { sub: "user_1", sessionVersion: 2 } })).toBeNull();
  });
  it("offers no OAuth or SSO provider, only password and the emailed link", () => {
    expect(config.providers.map((provider) => (provider as CredentialsConfig).id)).toEqual(["credentials", "magic-link"]);
    expect(config.callbacks?.signIn).toBeUndefined();
  });

  it("signs in with a live magic link and uses it up", async () => {
    expect(await authorize({ token: TOKEN }, 1)).toMatchObject({ id: "user_1", sessionVersion: 2 });
    expect(mocks.consumeLink).toHaveBeenCalledWith(TOKEN, "user_1");
  });

  it("refuses an unknown, expired or reused link", async () => {
    mocks.peek.mockResolvedValue(null);
    expect(await authorize({ token: TOKEN }, 1)).toBeNull();
    mocks.peek.mockResolvedValue("user_1");
    mocks.consumeLink.mockResolvedValue(false);
    expect(await authorize({ token: TOKEN }, 1)).toBeNull();
  });

  it("asks for the authenticator after the link without using the link up", async () => {
    mocks.find.mockResolvedValue({ id: "user_1", email: "person@example.test", emailVerified: new Date(), passwordHash: null, sessionVersion: 2, mfaSecretEncrypted: "enc" });
    await expect(authorize({ token: TOKEN }, 1)).rejects.toThrow();
    expect(mocks.consumeLink).not.toHaveBeenCalled();
    mocks.consume.mockResolvedValue(true);
    expect(await authorize({ token: TOKEN, totp: "123456" }, 1)).toMatchObject({ id: "user_1" });
    expect(mocks.consumeLink).toHaveBeenCalledOnce();
  });

  it("never signs a super admin in with a link", async () => {
    mocks.find.mockResolvedValue({ id: "user_1", email: "admin@example.test", emailVerified: new Date(), passwordHash: "hash", sessionVersion: 2, isSuperAdmin: true });
    expect(await authorize({ token: TOKEN }, 1)).toBeNull();
    expect(mocks.consumeLink).not.toHaveBeenCalled();
  });

  it("verifies the email address an opened link proves", async () => {
    mocks.find.mockResolvedValue({ id: "user_1", email: "person@example.test", emailVerified: null, passwordHash: null, sessionVersion: 2 });
    expect(await authorize({ token: TOKEN }, 1)).toMatchObject({ id: "user_1" });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "user_1" }, data: { emailVerified: expect.any(Date) } });
  });
});
