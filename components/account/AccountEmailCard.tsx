"use client";

import { useState, useTransition } from "react";
import { MailCheck, MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout, Chip } from "@/components/ui/display";
import { ReadOnlyValue } from "@/components/ui/field";
import { resendEmailVerification } from "@/app/actions/auth";
import { AccountCard } from "@/components/account/AccountCard";

/**
 * Address and verification status. Confirming happens from the emailed link
 * (/verify-email); here an unverified password account can ask for a new one.
 */
export function AccountEmailCard({ email, verified, canResend }: { email: string | null; verified: boolean; canResend: boolean }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  return (
    <AccountCard
      id="account-email"
      title="Email"
      description="Where Space Works Machines sends job updates, receipts and account emails."
      action={verified ? (
        <Chip size="sm" tone="success" icon={<MailCheck />}>Verified</Chip>
      ) : (
        <Chip size="sm" tone="warning" icon={<MailWarning />}>Not verified</Chip>
      )}
    >
      <div className="flex flex-col gap-4">
        <ReadOnlyValue value={email ?? "No email address"} />
        <p className="text-caption text-ink-muted">Changing your email address is coming in a future update.</p>
        {!verified && email ? (
          <div className="flex flex-col gap-3">
            {status ? <Callout tone={status.tone} role={status.tone === "danger" ? "alert" : "status"}>{status.text}</Callout> : null}
            {canResend ? (
              <Button
                variant="secondary"
                className="self-start"
                disabled={pending}
                onClick={() => {
                  setStatus(null);
                  startTransition(async () => {
                    let result;
                    try { result = await resendEmailVerification({ email }); }
                    catch { setStatus({ tone: "danger", text: "Email verification is temporarily unavailable. Please try again." }); return; }
                    if (!result.ok) setStatus({ tone: "danger", text: result.error });
                    else setStatus({ tone: "success", text: "If your address still needs confirming, a new verification link is on its way." });
                  });
                }}
              >
                {pending ? "Sending…" : "Resend verification email"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </AccountCard>
  );
}
