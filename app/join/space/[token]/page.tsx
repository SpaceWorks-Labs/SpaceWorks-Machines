import { loadJoinSpaceView } from "@/lib/views/app__join__space__token__page";
import { AcceptInviteButton } from "@/components/invites/AcceptInviteButton";
import { Chip, SpaceLogo } from "@/components/ui/display";
import type { Metadata } from "next";
import { ROLE_LABELS } from "@/lib/permissionRoles";

export const metadata: Metadata = { title: "Join space", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function JoinSpacePage({ params }: { params: Promise<{ token: string; }>; }) {
  const { token, session, invite } = await loadJoinSpaceView({ params });
  if (!invite || invite.usedAt || (invite.expiresAt && invite.expiresAt <= new Date())) {
    return (
      <div className="mx-auto flex w-full max-w-[440px] flex-col gap-2 rounded-xl border border-line bg-panel p-6 text-center sm:p-8">
        <h1 className="text-h1 text-ink">Invite unavailable</h1>
        <p className="text-body-ui text-ink-secondary">This invite has expired, been used or been revoked. Ask whoever invited you for a new link.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col items-center gap-4 rounded-xl border border-line bg-panel p-6 text-center sm:p-8">
      <SpaceLogo name={invite.space.name} src={invite.space.logoUrl} size="lg" />
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-ink-muted">You’ve been invited to join</p>
        <h1 className="text-h1 break-words text-ink">{invite.space.name}</h1>
      </div>
      <Chip size="sm">as {/^[AEIOU]/.test(ROLE_LABELS[invite.role]) ? "an" : "a"} {ROLE_LABELS[invite.role].toLowerCase()}</Chip>
      <p className="text-body-ui text-ink-secondary">Accept this single-use invitation to join the space.</p>
      <div className="w-full [&>div]:items-stretch [&_button]:w-full">
        <AcceptInviteButton token={token} />
      </div>
      {session.user?.email ? <p className="text-caption text-ink-muted">Signed in as {session.user.email}</p> : null}
    </div>
  );
}
