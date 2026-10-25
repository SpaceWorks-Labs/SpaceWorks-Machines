"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { leaveSpace } from "@/app/actions/account-spaces";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/menu";

const SOLE_OWNER_HINT = "Make someone else a machine manager, or delete the space first.";

export function LeaveSpaceButton({ spaceSlug, spaceName, soleOwner, pending: requestPending }: { spaceSlug: string; spaceName: string; soleOwner: boolean; pending?: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const hintId = useId();
  const label = requestPending ? "Withdraw request" : "Leave";

  if (soleOwner) {
    // A disabled button gets no pointer events, so the focusable wrapper carries the tooltip.
    return (
      <Tooltip content={`You're the only machine manager. ${SOLE_OWNER_HINT}`}>
        <span tabIndex={0} aria-describedby={hintId} className="inline-flex rounded-full">
          <Button size="sm" variant="secondary" disabled>
            Leave<span className="sr-only"> {spaceName}</span>
          </Button>
          <span id={hintId} className="sr-only">You are the only machine manager. {SOLE_OWNER_HINT}</span>
        </span>
      </Tooltip>
    );
  }

  return (
    <>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => setOpen(true)}>
        {label}<span className="sr-only"> {spaceName}</span>
      </Button>
      <ConfirmationDialog
        open={open}
        title={requestPending ? `Withdraw your request to join ${spaceName}?` : `Leave ${spaceName}?`}
        message={requestPending ? "You can ask again later." : "You lose access straight away. To come back you'd need to join again or be invited."}
        confirmLabel={requestPending ? "Withdraw request" : "Leave space"}
        loading={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          startTransition(async () => {
            const result = await leaveSpace({ spaceSlug });
            if (!result.ok) {
              showToast(result.error, "error");
              return;
            }
            setOpen(false);
            showToast(requestPending ? "Request withdrawn" : `You left ${spaceName}`, "success");
            router.refresh();
          });
        }}
      />
    </>
  );
}
