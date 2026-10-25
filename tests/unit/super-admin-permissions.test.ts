import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), userFind: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: mocks.userFind } } }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
  notFound: () => { throw new Error("not-found"); },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { requireSuperAdmin } from "@/lib/permissions";

const originalEmail = process.env.SUPER_ADMIN_EMAIL;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPER_ADMIN_EMAIL = "admin@example.test";
  mocks.auth.mockResolvedValue({ user: { id: "user_1", email: "stale@example.test" } });
  mocks.userFind.mockResolvedValue({ email: "admin@example.test", emailVerified: new Date(), isSuperAdmin: true });
});

afterEach(() => {
  if (originalEmail === undefined) delete process.env.SUPER_ADMIN_EMAIL;
  else process.env.SUPER_ADMIN_EMAIL = originalEmail;
});

describe("super-admin identity boundary", () => {
  it("authorizes against the current verified database email, not stale session claims", async () => {
    await expect(requireSuperAdmin()).resolves.toMatchObject({
      user: { id: "user_1", email: "admin@example.test" },
    });
    expect(mocks.userFind).toHaveBeenCalledWith({
      where: { id: "user_1" },
      select: { email: true, emailVerified: true, isSuperAdmin: true },
    });
  });

  it("rejects a stale session after the database email no longer matches", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user_1", email: "admin@example.test" } });
    mocks.userFind.mockResolvedValue({ email: "former-admin@example.test", emailVerified: new Date(), isSuperAdmin: false });
    await expect(requireSuperAdmin()).rejects.toThrow("not-found");
  });

  it("rejects an unverified current account", async () => {
    mocks.userFind.mockResolvedValue({ email: "admin@example.test", emailVerified: null, isSuperAdmin: true });
    await expect(requireSuperAdmin()).rejects.toThrow("not-found");
  });

  it("admits a verified user granted the platform admin flag", async () => {
    delete process.env.SUPER_ADMIN_EMAIL;
    mocks.userFind.mockResolvedValue({ email: "granted@example.test", emailVerified: new Date(), isSuperAdmin: true });
    await expect(requireSuperAdmin()).resolves.toMatchObject({ user: { id: "user_1", email: "granted@example.test" } });
  });

  it("rejects everyone without the flag when no bootstrap email is configured", async () => {
    delete process.env.SUPER_ADMIN_EMAIL;
    mocks.userFind.mockResolvedValue({ email: "someone@example.test", emailVerified: new Date(), isSuperAdmin: false });
    await expect(requireSuperAdmin()).rejects.toThrow("not-found");
  });

  it("never grants access by SUPER_ADMIN_EMAIL alone: super admins are made on the server", async () => {
    mocks.userFind.mockResolvedValue({ email: "admin@example.test", emailVerified: new Date(), isSuperAdmin: false });
    await expect(requireSuperAdmin()).rejects.toThrow("not-found");
  });
});
