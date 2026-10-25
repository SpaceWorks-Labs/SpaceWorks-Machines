import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email/transporter", () => ({
  getEmailTransport: vi.fn().mockResolvedValue({
    transporter: null,
    from: "Space Works Machines <noreply@example.test>",
  }),
  assertEmailAccepted: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { space: { findUnique: vi.fn().mockResolvedValue({ name: "Private Space", slug: "private-space" }) } } }));

import { sendBrandedEmail } from "@/lib/email/message";
import { deliverSpaceNotice, deliverOwnerInvite } from "@/lib/email/space";
import { sendEmailVerificationEmail } from "@/lib/email/emailVerification";
import { sendPasswordResetEmail } from "@/lib/email/passwordReset";

let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  log = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  log.mockRestore();
});

describe("mock email log safety", () => {
  it("never logs recipients, message content, or bearer capabilities", async () => {
    const recipient = "private-member@example.test";
    const inviteToken = "secret-invite-token";
    const resetToken = "secret-reset-token";
    const verificationToken = "secret-verification-token";

    await sendBrandedEmail({ to: recipient, subject: "Hi", heading: "Private heading", paragraphs: ["Private body text"], action: { label: "Open", url: `https://machines.example.test/x/${inviteToken}` } });
    await deliverSpaceNotice({ to: recipient, spaceId: "space_1", notice: "rejected", reason: "Private reviewer note" }, "<m@x>");
    await deliverOwnerInvite({ to: recipient, spaceId: "space_1", token: inviteToken, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }, "<m@x>");
    await sendPasswordResetEmail({ to: recipient, resetUrl: `https://machines.example.test/reset-password?token=${resetToken}` });
    await sendEmailVerificationEmail({ to: recipient, verificationUrl: `https://machines.example.test/verify-email?token=${verificationToken}` });

    const output = log.mock.calls.flat().join(" ");
    expect(output).not.toContain(recipient);
    expect(output).not.toContain("Private heading");
    expect(output).not.toContain("Private body text");
    expect(output).not.toContain("Private reviewer note");
    expect(output).not.toContain(inviteToken);
    expect(output).not.toContain(resetToken);
    expect(output).not.toContain(verificationToken);
  });
});
