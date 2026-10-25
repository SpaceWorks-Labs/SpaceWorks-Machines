"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmEmailVerification } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";

export function VerifyEmailForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex w-full flex-col gap-5">
      <p className="text-body-ui text-ink-secondary">
        Confirming your email activates your account so you can join spaces and use their machines.
      </p>
      {error ? <Callout tone="danger" role="alert" className="text-left">{error}</Callout> : null}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            let result;
            try { result = await confirmEmailVerification({ token }); }
            catch { setError("Email verification is temporarily unavailable. Please try again."); return; }
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.replace("/login?verified=1");
            router.refresh();
          });
        }}
      >
        {pending ? "Confirming…" : "Confirm email"}
      </Button>
    </div>
  );
}
