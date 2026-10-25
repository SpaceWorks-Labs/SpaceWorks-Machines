"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SpaceRole } from "@prisma/client";
import { updateSpaceRole, removeSpaceMember } from "@/app/actions/team";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { Dropdown } from "@/components/ui/field";
import { assignableRoles, canManageTeamMember, ROLE_LABELS } from "@/lib/permissionRoles";
import { ROLE_TONES } from "@/components/team/roleTones";

/** A staff row's role picker and remove button, limited to what the viewer's own role may change. */
export function MemberRoleActions(props: { spaceSlug: string; targetUserId: string; role: SpaceRole; actorRole: SpaceRole; isYou: boolean; memberName?: string }) {
  const { spaceSlug, targetUserId, role, actorRole, isYou, memberName } = props;
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const canEdit = !isYou && canManageTeamMember(actorRole, role);
  const options = assignableRoles(actorRole);

  if (!canEdit) return <Chip size="sm" tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</Chip>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dropdown
        aria-label={memberName ? `Role for ${memberName}` : "Role"}
        value={role}
        disabled={pending}
        className="w-auto min-w-[150px] py-2 text-sm"
        onChange={(event) => {
          const next = event.target.value as SpaceRole;
          startTransition(async () => {
            const result = await updateSpaceRole({ spaceSlug, targetUserId, role: next });
            if (!result.ok) {
              showToast(result.error, "error");
              return;
            }
            showToast("Role updated", "success");
            router.refresh();
          });
        }}
      >
        {options.map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
      </Dropdown>
      <Button size="sm" variant="dangerQuiet" disabled={pending} onClick={() => setConfirmRemove(true)}>
        Remove{memberName ? <span className="sr-only"> {memberName}</span> : null}
      </Button>
      <ConfirmationDialog
        open={confirmRemove}
        title={memberName ? `Remove ${memberName} from the space?` : "Remove from the space?"}
        message="They lose access to the space straight away."
        confirmLabel="Remove"
        loading={pending}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          startTransition(async () => {
            const result = await removeSpaceMember({ spaceSlug, targetUserId });
            if (!result.ok) {
              showToast(result.error, "error");
              return;
            }
            setConfirmRemove(false);
            showToast("Removed from the space", "success");
            router.refresh();
          });
        }}
      />
    </div>
  );
}
