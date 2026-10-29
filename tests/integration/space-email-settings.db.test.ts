import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const current = vi.hoisted(() => ({ access: {} as object, sendMail: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ spaceActionAccess: async () => current.access }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/spaceTransport", () => ({ spaceSmtpTransport: async () => ({ sendMail: current.sendMail }) }));
import { saveSpaceEmailSettings, sendSpaceTestEmail } from "@/app/actions/space-email";
import * as audit from "@/lib/audit";
import { prisma } from "@/lib/db";
import { machinesFixture, type MachinesFixture } from "../helpers/machines-db";

let f: MachinesFixture;
const settings = () => ({ spaceSlug: f.home.space.slug, enabled: true, fromName: "Workshop", fromAddress: "workshop@example.test",
  replyTo: "", smtpHost: "127.0.0.1", smtpPort: 587, smtpUser: "" });
beforeAll(async () => {
  f = await machinesFixture();
  current.access = { ok: true, space: f.home.space, userId: f.home.user.id };
});
afterAll(async () => { vi.restoreAllMocks(); await f?.cleanup(); });

describe.sequential("SMTP settings persistence and verification", () => {
  it("saves settings with field names in the same transaction as their audit", async () => {
    expect(await saveSpaceEmailSettings(settings())).toEqual({ ok: true });
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { spaceId: f.home.space.id, action: "SPACE_SETTINGS_CHANGED" } });
    expect(JSON.stringify(event.metadata)).toContain("smtpHost");
    expect(JSON.stringify(event.metadata)).not.toMatch(/127\.0\.0\.1|workshop@example/);
    const stopAudit = vi.spyOn(audit, "recordSettingsChange").mockRejectedValueOnce(new Error("Audit unavailable"));
    await expect(saveSpaceEmailSettings({ ...settings(), fromName: "Must roll back" })).rejects.toThrow("Audit unavailable");
    stopAudit.mockRestore();
    expect((await prisma.spaceEmailSettings.findUniqueOrThrow({ where: { spaceId: f.home.space.id } })).fromName).toBe("Workshop");
  });

  it("marks SMTP verified only when the relay accepts the intended recipient", async () => {
    current.sendMail.mockResolvedValueOnce({ accepted: [], rejected: [f.home.user.email] });
    expect(await sendSpaceTestEmail({ spaceSlug: f.home.space.slug })).toMatchObject({ ok: false });
    expect((await prisma.spaceEmailSettings.findUniqueOrThrow({ where: { spaceId: f.home.space.id } })).verifiedAt).toBeNull();
    current.sendMail.mockResolvedValueOnce({ accepted: [f.home.user.email], rejected: [] });
    expect(await sendSpaceTestEmail({ spaceSlug: f.home.space.slug })).toEqual({ ok: true });
    expect((await prisma.spaceEmailSettings.findUniqueOrThrow({ where: { spaceId: f.home.space.id } })).verifiedAt).toBeInstanceOf(Date);
  });

  it("does not verify settings saved while an earlier configuration's test is in flight", async () => {
    await prisma.spaceEmailSettings.update({ where: { spaceId: f.home.space.id }, data: { verifiedAt: null, updatedAt: new Date("2020-01-01") } });
    current.sendMail.mockImplementationOnce(async () => {
      expect(await saveSpaceEmailSettings({ ...settings(), fromName: "Changed while sending" })).toEqual({ ok: true });
      return { accepted: [f.home.user.email], rejected: [] };
    });
    expect(await sendSpaceTestEmail({ spaceSlug: f.home.space.slug })).toMatchObject({ ok: false, error: expect.stringContaining("changed") });
    expect(await prisma.spaceEmailSettings.findUniqueOrThrow({ where: { spaceId: f.home.space.id } }))
      .toMatchObject({ fromName: "Changed while sending", verifiedAt: null });
    current.sendMail.mockResolvedValueOnce({ accepted: [f.home.user.email], rejected: [] });
    expect(await sendSpaceTestEmail({ spaceSlug: f.home.space.slug })).toEqual({ ok: true });
  });
});
