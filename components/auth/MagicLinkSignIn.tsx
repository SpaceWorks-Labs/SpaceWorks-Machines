"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { loginErrorMessage, MfaStep } from "@/components/auth/MfaStep";
import { safeAuthRedirect } from "@/lib/authRedirect";

/** Finish a magic-link sign-in: one press, then the authenticator code for accounts that have one. */
export function MagicLinkSignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [code, setCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    setError(null);
    setLoading(true);
    let result;
    try {
      result = await signIn("magic-link", { token, ...(mfaRequired ? { totp: code } : {}), redirect: false });
    } catch {
      setLoading(false);
      setError("Sign-in is temporarily unavailable. Refresh the page and try again.");
      return;
    }
    setLoading(false);
    if (result?.error) {
      if (result.code === "mfa_required") { setMfaRequired(true); return; }
      if (result.code === "address_blocked") { setError(loginErrorMessage("address_blocked")); return; }
      setError(mfaRequired ? "Invalid authenticator or recovery code." : "This link has expired or has already been used. Ask for a new one.");
      return;
    }
    router.push(safeAuthRedirect(params.get("callbackUrl")));
    router.refresh();
  }

  if (mfaRequired) {
    return (
      <MfaStep email="your account" code={code} onCodeChange={setCode} error={error} verifying={loading} disabled={loading} onSubmit={submit}
        onUseDifferentAccount={() => router.push("/login")} />
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-m text-ink">Sign in to Space Works Machines</h1>
        <p className="text-body-ui text-ink-secondary">Your link is ready. It works once, so press the button to use it.</p>
      </div>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {token ? (
        <Button variant="primary" size="lg" fullWidth disabled={loading} onClick={() => void submit()}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      ) : <Callout tone="warning">This link is incomplete. Open it straight from the email, or ask for a new one.</Callout>}
      <Link href="/login" className={buttonClasses({ variant: "quiet" })}>Back to sign in</Link>
    </div>
  );
}
