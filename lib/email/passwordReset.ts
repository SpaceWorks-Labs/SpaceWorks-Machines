import { assertEmailAccepted, getEmailTransport } from "./transporter";
import { EMAIL_BUTTON_STYLE, EMAIL_COLORS, emailLayout } from "./brand";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
}


export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
  messageId?: string;
}): Promise<void> {
  const { transporter, from } = await getEmailTransport();
  const safeResetUrl = escapeHtml(params.resetUrl);

  const html = emailLayout("Reset Your Password", `
            <h2 style="margin-top: 0; color: ${EMAIL_COLORS.ink}; font-size: 20px; font-weight: 600;">Reset Your Password</h2>
            <p style="font-size: 16px; line-height: 1.5; color: ${EMAIL_COLORS.inkMuted}; margin-bottom: 24px;">
              Hello,<br><br>
              We received a request to reset the password for your account. Click the button below to set a new password. This link will expire in 1 hour.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${safeResetUrl}" style="${EMAIL_BUTTON_STYLE}">
                Reset Password
              </a>
            </div>
            <p style="font-size: 14px; text-align: center; color: ${EMAIL_COLORS.inkMuted}; margin-bottom: 24px;">
              Or copy and paste this link: <br>
              <a href="${safeResetUrl}" style="color: ${EMAIL_COLORS.teal}; text-decoration: underline; word-break: break-all;">${safeResetUrl}</a>
            </p>
            <p style="font-size: 13px; color: ${EMAIL_COLORS.inkMuted}; line-height: 1.5;">
              If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
            </p>`);

  const text = `Reset Your Password\n\nHello,\n\nWe received a request to reset your password. Visit the following link to set a new password (expires in 1 hour):\n\n${params.resetUrl}\n\nIf you didn't request this, you can safely ignore this email.\n\nBest regards,\nSpace Works Machines`;

  if (!transporter) {
    // Never print reset capabilities or account identifiers, including in
    // development and CI logs.
    console.log("[EMAIL MOCK] password reset email queued");
    return;
  }

  const result = await transporter.sendMail({
    messageId: params.messageId,
    from,
    to: params.to,
    subject: "Reset your Space Works Machines password",
    text,
    html,
  });
  assertEmailAccepted(result);
}
