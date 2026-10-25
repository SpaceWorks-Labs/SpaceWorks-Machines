import { assertEmailAccepted, getEmailTransport } from "./transporter";
import { EMAIL_BUTTON_STYLE, EMAIL_COLORS, emailLayout } from "./brand";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
}


export async function sendEmailVerificationEmail(params: {
  to: string;
  verificationUrl: string;
  messageId?: string;
}): Promise<void> {
  const { transporter, from } = await getEmailTransport();
  const safeUrl = escapeHtml(params.verificationUrl);
  const text = `Verify your email address\n\nOpen this link to activate your Space Works Machines account (it expires in 1 hour):\n\n${params.verificationUrl}\n\nIf you did not create an account, you can safely ignore this email.`;
  const html = emailLayout(
    "Verify your email",
    `<h2 style="margin-top:0;color:${EMAIL_COLORS.ink};font-size:20px;font-weight:600">Verify your email</h2><p style="font-size:16px;line-height:1.5;color:${EMAIL_COLORS.inkMuted}">Thanks for creating a Space Works Machines account. Verify that you control this email address to activate your account.</p><p style="text-align:center;margin:32px 0"><a href="${safeUrl}" style="${EMAIL_BUTTON_STYLE}">Verify email</a></p><p style="font-size:13px;color:${EMAIL_COLORS.inkMuted};overflow-wrap:anywhere">This link expires in 1 hour. If you did not create an account, you can safely ignore this email.</p>`,
  );

  if (!transporter) {
    // Do not print the bearer link, even in development logs.
    console.log("[EMAIL MOCK] Verification email queued");
    return;
  }
  const result = await transporter.sendMail({ messageId: params.messageId, from, to: params.to, subject: "Verify your Space Works Machines email", text, html });
  assertEmailAccepted(result);
}
