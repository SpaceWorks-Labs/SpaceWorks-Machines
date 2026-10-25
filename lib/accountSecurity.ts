/**
 * Pure helpers for the account Security page. The audit actions listed here
 * are the ones the app actually records for a person's own sign-in security
 * (see app/actions/security.ts, account.ts and password-reset.ts). Only the
 * action name and timestamp are ever shown; audit metadata never leaves the
 * server.
 */
export const SECURITY_ACTIVITY_LABELS = {
  MFA_ENABLED: "Two-step verification turned on",
  MFA_DISABLED: "Two-step verification turned off",
  ACCOUNT_PASSWORD_ADDED: "Password added",
  ACCOUNT_PASSWORD_CHANGED: "Password changed",
  ACCOUNT_PASSWORD_RESET: "Password reset by email link",
  SESSIONS_REVOKED: "Signed out everywhere",
} as const satisfies Record<string, string>;

export type SecurityActivityAction = keyof typeof SECURITY_ACTIVITY_LABELS;

export const SECURITY_ACTIVITY_ACTIONS = Object.keys(SECURITY_ACTIVITY_LABELS) as SecurityActivityAction[];

export const SECURITY_ACTIVITY_LIMIT = 10;

export function securityActivityLabel(action: string): string {
  return Object.hasOwn(SECURITY_ACTIVITY_LABELS, action) ? SECURITY_ACTIVITY_LABELS[action as SecurityActivityAction] : "Security change";
}

/** "14 Oct 2026" in UTC, so the server and browser agree. */
export function formatMemberSince(createdAt: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(createdAt);
}
