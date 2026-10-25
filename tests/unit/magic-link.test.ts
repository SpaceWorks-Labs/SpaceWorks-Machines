import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUser: vi.fn(), findToken: vi.fn(), deleteMany: vi.fn(), create: vi.fn(), enqueue: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    verificationToken: { findUnique: mocks.findToken, deleteMany: mocks.deleteMany },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ verificationToken: { deleteMany: mocks.deleteMany, create: mocks.create } }),
  },
}));
vi.mock("@/lib/outbox", () => ({ enqueueOutbox: mocks.enqueue }));

import { consumeMagicLink, issueMagicLink, MAGIC_LINK_TTL_MS, peekMagicLink } from "@/lib/magicLink";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

describe("magic links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue({ id: "user_1", isSuperAdmin: false });
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("stores only a hash, replaces older links and emails a 15-minute link", async () => {
    const now = Date.UTC(2030, 0, 1);
    expect(await issueMagicLink("person@example.test", now)).toBe(true);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { identifier: "magic-link:user_1" } });
    const stored = mocks.create.mock.calls[0][0].data;
    const payload = mocks.enqueue.mock.calls[0][2];
    const token = new URL(payload.url).searchParams.get("token")!;
    expect(stored).toEqual({ identifier: "magic-link:user_1", token: sha256(token), expires: new Date(now + MAGIC_LINK_TTL_MS) });
    expect(mocks.enqueue.mock.calls[0][1]).toBe("magic-link");
    expect(payload.to).toBe("person@example.test");
    expect(MAGIC_LINK_TTL_MS).toBe(15 * 60_000);
  });

  it("does nothing, silently, for unknown addresses and super admins", async () => {
    mocks.findUser.mockResolvedValueOnce(null);
    expect(await issueMagicLink("nobody@example.test")).toBe(false);
    mocks.findUser.mockResolvedValueOnce({ id: "admin", isSuperAdmin: true });
    expect(await issueMagicLink("admin@example.test")).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("finds the account behind a live link without using it up", async () => {
    const token = "t".repeat(43);
    mocks.findToken.mockResolvedValue({ identifier: "magic-link:user_1", expires: new Date(Date.now() + 60_000) });
    expect(await peekMagicLink(token)).toBe("user_1");
    expect(mocks.findToken).toHaveBeenCalledWith({ where: { token: sha256(token) }, select: { identifier: true, expires: true } });
    mocks.findToken.mockResolvedValue({ identifier: "magic-link:user_1", expires: new Date(Date.now() - 1) });
    expect(await peekMagicLink(token)).toBeNull();
    mocks.findToken.mockResolvedValue({ identifier: "reset:person@example.test", expires: new Date(Date.now() + 60_000) });
    expect(await peekMagicLink(token)).toBeNull();
    expect(await peekMagicLink("short")).toBeNull();
  });

  it("works once: only the caller that deletes the live row succeeds", async () => {
    const token = "t".repeat(43);
    expect(await consumeMagicLink(token, "user_1")).toBe(true);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { identifier: "magic-link:user_1", token: sha256(token), expires: { gt: expect.any(Date) } } });
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    expect(await consumeMagicLink(token, "user_1")).toBe(false);
  });
});
