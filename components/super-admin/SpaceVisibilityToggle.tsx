"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSpaceVisibility } from "@/app/actions/super-admin-spaces";
import { SwitchRow } from "@/components/ui/choice";
import { Callout, Card, CardHeader } from "@/components/ui/display";

/** List the space in the public directory, where anyone can find it and apply. */
export function SpaceVisibilityToggle({ spaceId, visibility, active }: { spaceId: string; visibility: "PUBLIC" | "UNLISTED"; active: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listed = visibility === "PUBLIC";

  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="Public listing" description="Listed spaces appear on the Spaces page. Unlisted ones are reachable only by their link." />
      <div className="flex flex-col gap-3">
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <SwitchRow
          label="List in the public directory"
          description={!active && !listed ? "Only an active space can be listed." : listed ? "Anyone can find it and apply to its open plans." : "Not listed."}
          checked={listed}
          disabled={pending || (!active && !listed)}
          onCheckedChange={(checked) => {
            setError(null);
            startTransition(async () => {
              const result = await setSpaceVisibility({ spaceId, visibility: checked ? "PUBLIC" : "UNLISTED" });
              if (!result.ok) setError(result.error);
              else router.refresh();
            });
          }}
        />
      </div>
    </Card>
  );
}
