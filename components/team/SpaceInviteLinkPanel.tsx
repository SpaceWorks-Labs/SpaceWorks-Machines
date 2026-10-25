"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2 } from "lucide-react";
import { MoodTile } from "@/components/brand/MoodTile";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import type { SpaceRole } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/permissionRoles";
import { createSpaceInvite, revokeSpaceInvite } from "@/app/actions/space-invites";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";

export type SpaceInviteRow = {
  id: string;
  token: string;
  role: SpaceRole;
  email: string | null;
  /** Pre-formatted on the server ("2 days ago") so it hydrates identically. */
  createdLabel: string;
};

function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Single-use invite links with a role, optionally bound to (and emailed to) one address. Machine managers only;
 * the actions re-check the role. Only the newest link's URL is ever rendered.
 */
export function SpaceInviteLinkPanel(props: {
  spaceSlug: string;
  baseUrl: string;
  invites: SpaceInviteRow[];
  roles: SpaceRole[];
}) {
  const { spaceSlug, baseUrl, roles } = props;
  const [role, setRole] = useState<SpaceRole>("MEMBER");
  const [email, setEmail] = useState("");
  const router = useRouter();
  const [invites, setInvites] = useState<SpaceInviteRow[]>(props.invites);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();
  const [revokeTarget, setRevokeTarget] = useState<SpaceInviteRow | null>(null);

  const latest = invites[0] ?? null;
  const latestUrl = latest ? `${baseUrl}/join/space/${latest.token}` : "";

  function createLink() {
    startTransition(async () => {
      const res = await createSpaceInvite({ spaceSlug, role, email: email.trim() });
      if (!res.ok) {
        showToast(res.error, "error");
        return;
      }
      const { inviteId, token } = res.data as { inviteId: string; token: string };
      setInvites((prev) => [{ id: inviteId, token, role, email: email.trim() || null, createdLabel: "Just now" }, ...prev]);
      showToast(email.trim() ? `Invite emailed to ${email.trim()}` : "Invite link created", "success");
      setEmail("");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="invite-title" className="flex min-w-0 flex-col gap-3.5 rounded-xl bg-tint-peach p-5">
      <div className="flex items-center gap-3">
        <MoodTile mood="cheering" size={52} className="sw-face shrink-0" />
        <div className="min-w-0">
          <h2 id="invite-title" className="scroll-mt-20 text-h4 text-ink">Invite people</h2>
          <p className="text-body-ui text-ink-secondary">Each link adds one person with the role you choose. Add an email to send it, and only that person can use it.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <Field label="Role">
          <Dropdown value={role} onChange={(event) => setRole(event.target.value as SpaceRole)} disabled={pending}>
            {roles.map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
          </Dropdown>
        </Field>
        <Field label="Email" optional>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} disabled={pending} autoComplete="off" />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="space-invite-url" className="text-label text-ink">Newest link</label>
        <input
          id="space-invite-url"
          readOnly
          value={latestUrl}
          placeholder="No open link yet"
          onFocus={(event) => event.currentTarget.select()}
          className="block min-h-11 w-full min-w-0 truncate rounded-control border border-line bg-panel px-3.5 tabular-nums text-[13px] text-ink-secondary placeholder:font-sans placeholder:text-ink-muted"
        />
        <div className="flex flex-wrap gap-2">
          {latestUrl ? (
            <>
              <Button
                variant="primary"
                disabled={pending}
                startIcon={<Copy />}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(latestUrl)
                    .then(() => showToast("Copied link", "success"))
                    .catch(() => showToast("Could not copy link", "error"));
                }}
              >
                Copy link
              </Button>
              <Button variant="secondary" loading={pending} loadingLabel="Creating link" startIcon={<Link2 />} onClick={createLink}>
                New link
              </Button>
            </>
          ) : (
            <Button variant="primary" loading={pending} loadingLabel="Creating link" startIcon={<Link2 />} onClick={createLink}>
              Create link
            </Button>
          )}
        </div>
      </div>

      {invites.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <h3 className="text-overline text-ink-muted">Open links · {invites.length}</h3>
          <ul className="flex flex-col">
            {invites.map((invite, index) => (
              <li key={invite.id} className="flex min-w-0 items-center gap-2.5">
                <span className="min-w-0 flex-1 truncate text-body-ui text-ink" title={invite.email ?? undefined}>{ROLE_LABELS[invite.role]}{invite.email ? ` · ${invite.email}` : ""} · {lowerFirst(invite.createdLabel)}</span>
                {index === 0 ? <Chip size="sm" tone="outline" className="shrink-0">Newest</Chip> : null}
                <Button size="sm" variant="dangerQuiet" disabled={pending} onClick={() => setRevokeTarget(invite)}>
                  Revoke
                  <span className="sr-only"> link created {lowerFirst(invite.createdLabel)}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ConfirmationDialog
        open={revokeTarget !== null}
        title="Revoke invite link?"
        message="Anyone who has this link will no longer be able to use it to join the space."
        confirmLabel="Revoke link"
        loading={pending}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => {
          const target = revokeTarget;
          if (!target) return;
          startTransition(async () => {
            const res = await revokeSpaceInvite({ spaceSlug, inviteId: target.id });
            if (!res.ok) {
              showToast(res.error, "error");
              return;
            }
            setInvites((prev) => prev.filter((x) => x.id !== target.id));
            setRevokeTarget(null);
            showToast("Invite revoked", "success");
            router.refresh();
          });
        }}
      />
    </section>
  );
}
