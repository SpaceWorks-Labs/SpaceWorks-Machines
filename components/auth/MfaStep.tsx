"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";

/** The second sign-in step: an authenticator code, or a code emailed for a sign-in from a new browser. */
export function MfaStep({
  kind = "authenticator",
  email,
  code,
  onCodeChange,
  error,
  verifying,
  disabled,
  onSubmit,
  onUseDifferentAccount,
}: {
  kind?: "authenticator" | "email";
  email: string;
  code: string;
  onCodeChange: (value: string) => void;
  error: string | null;
  verifying: boolean;
  disabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUseDifferentAccount: () => void;
}) {
  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-h2 text-ink">Verify it&apos;s you</h2>
        <p className="text-body-ui text-ink-secondary">{kind === "email" ? <>This browser is new to {email}, so we&apos;ve emailed you a six-digit code. It works for 10 minutes.</> : <>Enter the code from your authenticator app for {email}.</>}</p>
      </div>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <Field label={kind === "email" ? "Code from your email" : "Authenticator or recovery code"} required helperText={kind === "email" ? "Didn't get it? Check spam, or sign in again in a minute for a new one." : "Use a six-digit authenticator code or a recovery code."}>
        <Input autoFocus value={code} onChange={(e) => onCodeChange(e.target.value)} autoComplete="one-time-code" inputMode={kind === "email" ? "numeric" : undefined} />
      </Field>
      <Button type="submit" variant="primary" size="lg" fullWidth disabled={disabled}>
        {verifying ? "Verifying…" : "Verify and sign in"}
      </Button>
      <Button variant="quiet" className="self-center" disabled={disabled} onClick={onUseDifferentAccount}>
        Use a different account
      </Button>
    </form>
  );
}

/** Words for the error codes Auth.js and our callbacks send back to /login. */
export function loginErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === "account_creation_disabled") return "New account creation is currently unavailable. Ask an administrator for access or sign in with an existing account.";
  if (code === "address_blocked") return "Too many failed sign-ins from your network. Try again in an hour, or ask your administrator.";
  if (code === "super_admin_password_only") return "This is a super-admin account. Sign in with its email and password.";
  return "Sign-in could not be completed. Try again, or ask for a new sign-in link.";
}
