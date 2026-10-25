"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSpace } from "@/app/actions/team";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

/**
 * Owner-only delete. The confirmation stays locked until the space's
 * exact name is typed; the server action still enforces ownership.
 */
export function DeleteSpaceButton(props: {
  spaceSlug: string;
  spaceName: string;
}) {
  const { spaceSlug, spaceName } = props;
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  // A fresh key per opening remounts the dialog so the typed name always starts empty.
  const [dialogKey, setDialogKey] = useState(0);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        variant="danger"
        onClick={() => {
          setDialogKey((key) => key + 1);
          setOpen(true);
        }}
      >
        Delete space…
      </Button>
      <ConfirmDialog
        key={dialogKey}
        open={open}
        title={`Delete ${spaceName}?`}
        message="All machines, jobs, files, makers and staff for this space will be permanently removed. This can't be undone."
        confirmLabel="Delete"
        confirmText={spaceName}
        loading={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          startTransition(async () => {
            const res = await deleteSpace({ spaceSlug });
            if (!res.ok) {
              showToast(res.error, "error");
              return;
            }
            setOpen(false);
            showToast("Space deleted", "success");
            router.push("/dashboard");
          });
        }}
      />
    </>
  );
}
