"use client";

import { useState, useTransition } from "react";
import { setSpaceApplicationsEnabled } from "@/app/actions/instance-settings";
import { SwitchRow } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";

/** Whether anyone can apply for a new space at /start. Platform admins can always add one. */
export function SpaceApplicationsControl({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel px-4 py-3">
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <SwitchRow
        label={enabled ? "Taking applications at /start" : "Applications are closed"}
        description="You can always add a space yourself."
        checked={enabled}
        disabled={pending}
        onCheckedChange={(checked) => {
          const previous = enabled;
          setEnabled(checked);
          setError(null);
          startTransition(async () => {
            const result = await setSpaceApplicationsEnabled({ allowSpaceApplications: checked });
            if (!result.ok) {
              setEnabled(previous);
              setError(result.error);
            }
          });
        }}
      />
    </div>
  );
}
