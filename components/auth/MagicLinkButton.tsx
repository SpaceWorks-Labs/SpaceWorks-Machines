"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestMagicLink } from "@/app/actions/auth";

/** "Email me a sign-in link": the password-free way in. The answer never says whether the address has an account. */
export function MagicLinkButton({ currentEmail, disabled, onSent, onError }: {
  currentEmail: () => string;
  disabled: boolean;
  onSent: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [sending, setSending] = useState(false);
  async function send() {
    const email = currentEmail().trim();
    if (!email) {
      onError("Enter your email address first, then ask for a link.");
      return;
    }
    setSending(true);
    try {
      const result = await requestMagicLink({ email });
      if (result.ok) onSent(`If ${email} has an account, a sign-in link is on its way. It works once, for 15 minutes.`);
      else onError(result.error);
    } catch {
      onError("Email delivery is temporarily unavailable. Try again, or sign in with your password.");
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-caption text-ink-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
      </div>
      <Button type="button" variant="secondary" size="lg" fullWidth disabled={disabled || sending} onClick={send}>
        <Mail aria-hidden className="size-4" />
        {sending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </div>
  );
}
