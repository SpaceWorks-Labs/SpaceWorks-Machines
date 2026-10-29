import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const mail = vi.hoisted(() => ({ verify: vi.fn(), reset: vi.fn(), magic: vi.fn() }));
vi.mock("@/lib/email/emailVerification", () => ({ sendEmailVerificationEmail: mail.verify }));
vi.mock("@/lib/email/passwordReset", () => ({ sendPasswordResetEmail: mail.reset }));
vi.mock("@/lib/email/magicLink", async (original) => ({
  ...await original<typeof import("@/lib/email/magicLink")>(), deliverMagicLink: mail.magic,
}));
const { deliverOutboxBatch } = await import("@/lib/outbox");
const ids: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
afterAll(async () => {
  await prisma.outboxMessage.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("production HTTP installation outbox capabilities", () => {
  function httpInstallation() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_PLAIN_HTTP", "1");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://makerspace.local");
    mail.verify.mockResolvedValue(undefined);
    mail.reset.mockResolvedValue(undefined);
    mail.magic.mockResolvedValue("sent");
  }

  it("delivers all three supported same-origin links and deletes the bearer rows", async () => {
    httpInstallation();
    const expiresAt = new Date(Date.now() + 600_000).toISOString();
    const to = "outbox-http-fixture@example.test";
    const payloads: Prisma.OutboxMessageCreateInput[] = [
      { kind: "email-verification", payload: { to, verificationUrl: "http://makerspace.local/verify-email?token=fixture", expiresAt } },
      { kind: "password-reset", payload: { to, resetUrl: "http://makerspace.local/reset-password?token=fixture", expiresAt } },
      { kind: "magic-link", payload: { to, url: "http://makerspace.local/api/auth/callback/nodemailer?token=fixture", expiresAt } },
    ];
    const current: string[] = [];
    for (const data of payloads) current.push((await prisma.outboxMessage.create({ data })).id);
    ids.push(...current);
    expect(await deliverOutboxBatch(20, { ids: current })).toEqual({ sent: 3, failed: 0 });
    for (const send of Object.values(mail)) expect(send).toHaveBeenCalledTimes(1);
    expect(await prisma.outboxMessage.count({ where: { id: { in: current } } })).toBe(0);
    expect(await deliverOutboxBatch(20, { ids: current })).toEqual({ sent: 0, failed: 0 });
  });

  it("permanently rejects a foreign HTTP capability even with HTTP enabled", async () => {
    httpInstallation();
    const row = await prisma.outboxMessage.create({ data: { kind: "email-verification", payload: {
      to: "outbox-http-fixture@example.test", verificationUrl: "http://foreign.example/verify-email?token=fixture", expiresAt: new Date(Date.now() + 600_000).toISOString(),
    } } });
    ids.push(row.id);
    expect(await deliverOutboxBatch(20, { ids: [row.id] })).toEqual({ sent: 0, failed: 1 });
    expect(mail.verify).not.toHaveBeenCalled();
    expect(await prisma.outboxMessage.findUnique({ where: { id: row.id } })).toBeNull();
  });
});
