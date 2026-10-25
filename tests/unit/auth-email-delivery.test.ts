import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendMail: vi.fn() }));

vi.mock("@/lib/email/transporter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/transporter")>();
  return {
    ...actual,
    getEmailTransport: vi.fn().mockResolvedValue({
      transporter: { sendMail: mocks.sendMail },
      from: "Space Works Events <noreply@example.test>",
    }),
  };
});

import { EmailRecipientRejectedError } from "@/lib/email/transporter";
import { sendEmailVerificationEmail } from "@/lib/email/emailVerification";
import { sendPasswordResetEmail } from "@/lib/email/passwordReset";

describe("authentication email delivery", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["verification", () => sendEmailVerificationEmail({ to: "person@example.test", verificationUrl: "https://members.test/verify-email?token=secret" })],
    ["password reset", () => sendPasswordResetEmail({ to: "person@example.test", resetUrl: "https://members.test/reset-password?token=secret" })],
  ])("retries when SMTP rejects a %s recipient", async (_kind, send) => {
    mocks.sendMail.mockResolvedValue({ accepted: [], rejected: ["person@example.test"] });

    await expect(send()).rejects.toBeInstanceOf(EmailRecipientRejectedError);
  });
});
