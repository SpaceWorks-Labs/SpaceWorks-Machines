"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { JoinPolicy, SpaceMemberStatus, SpaceRole } from "@prisma/client";
import { joinSpace } from "@/app/actions/account-spaces";
import { Button, buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { isStaffRole } from "@/lib/permissionRoles";

type Viewer = { signedIn: boolean; emailVerified: boolean; role: SpaceRole | null; status: SpaceMemberStatus | null };

/** The visitor's way in: sign in, join, ask to join, or where they already stand. */
export function JoinSpaceCard({ slug, name, joinPolicy, takingMakers, viewer }: { slug: string; name: string; joinPolicy: JoinPolicy; takingMakers: boolean; viewer: Viewer }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (viewer.role && viewer.status === "ACTIVE") {
    return isStaffRole(viewer.role)
      ? <Callout tone="success" title="You help run this space" action={<Link href={`/dashboard/${slug}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>Open the dashboard</Link>}>Your staff role gives you the space dashboard.</Callout>
      : <Callout tone="success" title={`You're a maker at ${name}`}>Browse the machines and request a job from any machine&apos;s page.</Callout>;
  }
  if (viewer.status === "PENDING") return <Callout tone="info" title="Request sent">A machine manager will look at it. We&apos;ll email you when they decide.</Callout>;
  if (viewer.status === "BLOCKED") return <Callout tone="warning" title="You can't join this space">Ask the space if you think this is a mistake.</Callout>;
  if (!takingMakers) return <Callout tone="warning" title="Not taking new makers">{name} isn&apos;t taking new makers right now.</Callout>;
  if (joinPolicy === "INVITE_ONLY") return <Callout tone="info" title="Invite only">{name} adds makers by invitation. Ask the space for an invite.</Callout>;
  if (!viewer.signedIn) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/login?callbackUrl=${encodeURIComponent(`/s/${slug}`)}`} className={buttonClasses({ variant: "accent" })}>Sign in to join</Link>
        <span className="text-body-ui text-ink-muted">New here? You can create an account on the same page.</span>
      </div>
    );
  }
  if (!viewer.emailVerified) return <Callout tone="warning" title="Verify your email first" action={<Link href="/account/profile" className={buttonClasses({ variant: "secondary", size: "sm" })}>Verify your email</Link>}>Spaces know makers by their verified email address.</Callout>;

  return (
    <div className="flex flex-col gap-3">
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="accent"
          loading={pending}
          onClick={() => startTransition(async () => {
            setError(null);
            const result = await joinSpace({ spaceSlug: slug });
            if (!result.ok) { setError(result.error); return; }
            router.refresh();
          })}
        >
          {joinPolicy === "OPEN" ? `Join ${name}` : "Ask to join"}
        </Button>
        <span className="text-body-ui text-ink-muted">{joinPolicy === "OPEN" ? "You join straight away." : "A machine manager approves new makers."}</span>
      </div>
    </div>
  );
}
