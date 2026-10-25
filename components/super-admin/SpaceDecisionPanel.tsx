"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SpaceStatus } from "@prisma/client";
import { reviewSpace } from "@/app/actions/super-admin-spaces";
import { decisionsFor, REVIEW_DECISIONS, type ReviewDecision } from "@/lib/spaceLifecycle";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";

const VARIANTS: Record<ReviewDecision, ButtonVariant> = {
  approve: "primary",
  "request-changes": "secondary",
  reject: "dangerOutline",
  suspend: "dangerOutline",
  reactivate: "primary",
  archive: "neutral",
};

/** The platform admin's decisions for this space's current status, with a note the machine managers receive. */
export function SpaceDecisionPanel({ spaceId, status }: { spaceId: string; status: SpaceStatus }) {
  const router = useRouter();
  const decisions = decisionsFor(status);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ReviewDecision | null>(null);
  const [pending, startTransition] = useTransition();

  if (decisions.length === 0) return null;
  const needsNote = decisions.some((decision) => REVIEW_DECISIONS[decision].reasonRequired);

  const run = (decision: ReviewDecision) => {
    setError(null);
    if (REVIEW_DECISIONS[decision].reasonRequired && !reason.trim()) {
      setError(`Add a note before you choose “${REVIEW_DECISIONS[decision].label}”. The machine managers are told it.`);
      return;
    }
    startTransition(async () => {
      const result = await reviewSpace({ spaceId, decision, reason });
      setConfirming(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReason("");
      router.refresh();
    });
  };

  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="Decision" description={status === "PENDING_REVIEW" || status === "CHANGES_REQUESTED" ? "Read the application, then decide. Machine managers are emailed every decision." : "Machine managers are emailed when you suspend or reactivate."} />
      <div className="flex flex-col gap-4">
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        {needsNote ? (
          <Field label="Note to the space" optional helperText="Required to ask for changes, decline or suspend. Shown to the machine managers as written.">
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={2000} disabled={pending} />
          </Field>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {decisions.map((decision) => (
            <Button
              key={decision}
              type="button"
              variant={VARIANTS[decision]}
              disabled={pending}
              loading={pending && confirming === decision}
              onClick={() => (REVIEW_DECISIONS[decision].confirm ? setConfirming(decision) : run(decision))}
            >
              {REVIEW_DECISIONS[decision].label}
            </Button>
          ))}
        </div>
      </div>
      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? `${REVIEW_DECISIONS[confirming].label} this space?` : ""}
        message={confirming ? REVIEW_DECISIONS[confirming].confirm : undefined}
        confirmLabel={confirming ? REVIEW_DECISIONS[confirming].label : "Confirm"}
        destructive={confirming !== "archive"}
        loading={pending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && run(confirming)}
      />
    </Card>
  );
}
