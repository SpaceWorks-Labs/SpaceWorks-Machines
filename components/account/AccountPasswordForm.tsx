"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, PasswordInput } from "@/components/ui/field";
import { updateAccountPassword } from "@/app/actions/account";
import { AccountCard } from "@/components/account/AccountCard";

export function AccountPasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const title = hasPassword ? "Change password" : "Add a password";
  const passwordTooShort = newPassword.length > 0 && newPassword.length < 12;
  const passwordsDoNotMatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <AccountCard
      id="account-password"
      title={hasPassword ? "Password" : title}
      description={hasPassword
        ? "Changing your password signs you out on every device."
        : "Add a password alongside emailed sign-in links. You will be signed out after it is set."}
    >
      <form
        className="flex max-w-md flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          if (newPassword.length < 12) {
            setError("New password must be at least 12 characters.");
            return;
          }
          if (newPassword !== confirmPassword) {
            setError("New passwords do not match.");
            return;
          }
          startTransition(async () => {
            let result;
            try { result = await updateAccountPassword({
              currentPassword,
              newPassword,
              confirmPassword,
            }); } catch { setError("Password updates are temporarily unavailable. Please try again."); return; }
            if (!result.ok) {
              setError(result.fieldErrors?.newPassword?.[0] ?? result.error);
              return;
            }
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            await signOut({ callbackUrl: "/login" });
          });
        }}
      >
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        {hasPassword ? (
          <Field label="Current password" required>
            <PasswordInput value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
          </Field>
        ) : null}
        <Field label="New password" required helperText="At least 12 characters." error={passwordTooShort ? "At least 12 characters." : undefined}>
          <PasswordInput value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} />
        </Field>
        <Field label="Confirm new password" required error={passwordsDoNotMatch ? "Passwords do not match." : undefined}>
          <PasswordInput value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
        </Field>
        <Button
          type="submit"
          variant="primary"
          className="w-full sm:w-auto sm:self-start"
          disabled={
            pending ||
            !newPassword ||
            !confirmPassword ||
            passwordTooShort ||
            passwordsDoNotMatch
          }
        >
          {pending ? "Saving…" : hasPassword ? "Update password" : title}
        </Button>
      </form>
    </AccountCard>
  );
}
