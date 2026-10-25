"use client";

import { useState, useTransition } from "react";
import { SwitchRow } from "@/components/ui/choice";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { setNewUserRegistrationEnabled } from "@/app/actions/instance-settings";

export function AccountCreationControl({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="New account creation" description="When disabled, only existing accounts can sign in." />
      <div className="flex flex-col gap-3">
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <SwitchRow
          label={enabled ? "New users can create accounts" : "New account creation is disabled"}
          checked={enabled}
          disabled={pending}
          onCheckedChange={(checked) => {
            const previous = enabled;
            setEnabled(checked);
            setError(null);
            startTransition(async () => {
              const result = await setNewUserRegistrationEnabled({ allowNewUserSignups: checked });
              if (!result.ok) {
                setEnabled(previous);
                setError(result.error);
              }
            });
          }}
        />
      </div>
    </Card>
  );
}
