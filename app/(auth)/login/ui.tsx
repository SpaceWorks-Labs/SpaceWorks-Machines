"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MagicLinkButton } from "@/components/auth/MagicLinkButton";
import { loginErrorMessage, MfaStep } from "@/components/auth/MfaStep";
import { Callout } from "@/components/ui/display";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { safeAuthRedirect } from "@/lib/authRedirect";
import { resendEmailVerification, signUpWithPassword } from "@/app/actions/auth";

type Mode = "signin" | "signup";

export function LoginForm({ accountCreationEnabled }: { accountCreationEnabled: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const callbackUrl = useMemo(() => {
    return safeAuthRedirect(sp.get("callbackUrl"));
  }, [sp]);

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [emailCodeRequired, setEmailCodeRequired] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(() =>
    sp.get("verified") === "1" ? "Email verified. You can now sign in." : null,
  );
  const [error, setError] = useState<string | null>(() => loginErrorMessage(sp.get("error")));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const currentCredentials = useCallback(() => {
    const currentEmail = emailInputRef.current?.value ?? email;
    const currentPassword = passwordInputRef.current?.value ?? password;
    if (currentEmail !== email) setEmail(currentEmail);
    if (currentPassword !== password) setPassword(currentPassword);
    return { email: currentEmail, password: currentPassword };
  }, [email, password]);

  useEffect(() => {
    // Browser and password-manager autofill can populate inputs without
    // dispatching an input/change event. Synchronise those DOM values so the
    // visible fields and the credentials submitted by this controlled form
    // never diverge.
    const syncAutofill = () => { currentCredentials(); };
    const animationFrame = window.requestAnimationFrame(syncAutofill);
    const timeout = window.setTimeout(syncAutofill, 250);
    window.addEventListener("pageshow", syncAutofill);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
      window.removeEventListener("pageshow", syncAutofill);
    };
  }, [currentCredentials]);

  function resetStatus() {
    setError(null);
    setMessage(null);
    setFieldErrors({});
  }

  function resetMfaChallenge() {
    setMfaRequired(false);
    setEmailCodeRequired(false);
    setTotp("");
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    resetStatus();
    setLoading("credentials");
    const credentials = currentCredentials();
    let r;
    try {
      r = await signIn("credentials", {
        email: credentials.email,
        password: credentials.password,
        ...(emailCodeRequired ? { emailCode: totp } : { totp }),
        redirect: false,
      });
    } catch {
      setLoading(null);
      setError("Sign-in is temporarily unavailable. Please refresh the page and try again.");
      return;
    }
    setLoading(null);
    if (!r) {
      setError("Unexpected error. Please try again.");
      return;
    }
    if (r.error) {
      if (r.code === "mfa_required") {
        setMfaRequired(true);
        return;
      }
      if (r.code === "address_blocked") {
        setError(loginErrorMessage("address_blocked"));
        return;
      }
      if (r.code === "email_code_required") {
        if (emailCodeRequired && totp) setError("That code didn't match or has expired.");
        setEmailCodeRequired(true);
        setTotp("");
        return;
      }
      if (r.code === "email_verification_required") {
        setNeedsEmailVerification(true);
        setMessage("Verify your email before signing in. You can request a new link below.");
        return;
      }
      setError(mfaRequired ? "Invalid authenticator or recovery code." : emailCodeRequired ? "That code didn't match or has expired." : "Invalid email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    resetStatus();
    setLoading("signup");
    let res;
    try {
      res = await signUpWithPassword({ name, email, password });
    } catch {
      setLoading(null);
      setError("Account creation is temporarily unavailable. Please try again.");
      return;
    }
    if (!res.ok) {
      setError(res.error);
      setFieldErrors(res.fieldErrors ?? {});
      setLoading(null);
      return;
    }
    setLoading(null);
    setNeedsEmailVerification(true);
    setMessage("If this email can be registered, check your inbox for a verification link. Otherwise, sign in or reset your password.");
    setMode("signin");
    setPassword("");
  }

  async function handleResendVerification() {
    resetStatus();
    setLoading("resend-verification");
    let result;
    try {
      result = await resendEmailVerification({ email });
    } catch {
      setLoading(null);
      setError("Email delivery is temporarily unavailable. Please try again.");
      return;
    }
    setLoading(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage("If that account needs verification, a new link has been sent.");
  }

  const isSignUp = mode === "signup";

  if (mfaRequired || emailCodeRequired) {
    return (
      <MfaStep
        kind={emailCodeRequired ? "email" : "authenticator"}
        email={email}
        code={totp}
        onCodeChange={setTotp}
        error={error}
        verifying={loading === "credentials"}
        disabled={!!loading}
        onSubmit={handleSignIn}
        onUseDifferentAccount={() => {
          resetMfaChallenge();
          resetStatus();
        }}
      />
    );
  }

  const switchMode = (next: Mode) => {
    setMode(next);
    resetStatus();
    resetMfaChallenge();
    setNeedsEmailVerification(false);
  };

  return (
    <Tabs value={mode} onValueChange={(value) => switchMode(value as Mode)} className="flex flex-col gap-4">
      {/* A lone "Sign in" tab would be a control with nothing to switch to. */}
      {accountCreationEnabled ? <TabsList aria-label="Sign in or create an account" className="grid auto-cols-fr grid-flow-col gap-1 rounded-full border border-line bg-surface p-1">
        <TabsTrigger value="signin" className="min-h-11 justify-center rounded-full px-4 after:hidden border border-transparent data-[state=active]:border-line-strong data-[state=active]:bg-panel data-[state=active]:font-semibold">Sign in</TabsTrigger>
        <TabsTrigger value="signup" className="min-h-11 justify-center rounded-full px-4 after:hidden border border-transparent data-[state=active]:border-line-strong data-[state=active]:bg-panel data-[state=active]:font-semibold">Create account</TabsTrigger>
      </TabsList> : null}

      <TabsContent value={mode} className="flex flex-col gap-4 pt-0">
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        {message ? <Callout tone="success" role="status">{message}</Callout> : null}

        {needsEmailVerification ? (
          <Button variant="secondary" className="self-start" disabled={!!loading || !email} onClick={handleResendVerification}>
            {loading === "resend-verification" ? "Sending…" : "Resend verification email"}
          </Button>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={isSignUp ? handleSignUp : handleSignIn}>
          {isSignUp ? (
            <Field label="Name" required error={fieldErrors.name?.[0]}>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
          ) : null}
          <Field label="Email" required error={fieldErrors.email?.[0]}>
            <Input
              ref={emailInputRef}
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                resetMfaChallenge();
              }}
              autoComplete="email"
            />
          </Field>
          <div className="relative">
            <Field label="Password" required error={fieldErrors.password?.[0]} helperText={isSignUp ? "At least 12 characters." : undefined}>
              <PasswordInput
                ref={passwordInputRef}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  resetMfaChallenge();
                }}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                minLength={isSignUp ? 12 : undefined}
                maxLength={128}
              />
            </Field>
            {!isSignUp ? (
              <Link href="/reset-password" className="absolute right-0 top-0 text-sm font-semibold after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] text-ink-secondary underline underline-offset-4 hover:text-ink">
                Forgot password?
              </Link>
            ) : null}
          </div>
          <Button type="submit" variant="primary" size="lg" fullWidth disabled={!!loading} className="mt-1">
            {isSignUp
              ? loading === "signup"
                ? "Creating account…"
                : "Create account"
              : loading === "credentials"
                ? "Signing in…"
                : "Sign in"}
          </Button>
        </form>

        {!isSignUp ? (
          <MagicLinkButton
            currentEmail={() => currentCredentials().email}
            disabled={!!loading}
            onSent={(text) => { resetStatus(); setMessage(text); }}
            onError={(text) => { resetStatus(); setError(text); }}
          />
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
