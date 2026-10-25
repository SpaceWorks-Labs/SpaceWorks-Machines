import Link from "next/link";
import type { Metadata } from "next";
import { loadAccountSpacesView } from "@/lib/views/app__account__page";
import { LeaveSpaceButton } from "@/components/account/spaces/LeaveSpaceButton";
import { buttonClasses } from "@/components/ui/button";
import { Chip, EmptyState, SectionHeading, SpaceLogo } from "@/components/ui/display";
import { ROLE_LABELS, isStaffRole } from "@/lib/permissionRoles";

export const metadata: Metadata = { title: "Your spaces" };

const joined = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** My spaces: where the person is a maker or on the staff. Jobs and payments join this page in later phases. */
export default async function AccountSpacesPage() {
  const { spaces } = await loadAccountSpacesView();
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Your spaces" description="Makerspaces you use as a maker, and the ones you help run." />
      {spaces.length === 0 ? (
        <EmptyState
          mood="waiting"
          title="No spaces yet"
          action={<Link href="/spaces" className={buttonClasses({ variant: "secondary", size: "sm" })}>Find a makerspace</Link>}
        >
          Join a makerspace to book its machines. Spaces you join or are invited to show up here.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Your spaces">
          {spaces.map((space) => {
            const staff = isStaffRole(space.role);
            const href = staff && space.status === "ACTIVE" ? `/dashboard/${space.slug}` : `/s/${space.slug}`;
            return (
              <li key={space.slug} className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-panel p-4">
                <SpaceLogo name={space.name} src={space.logoUrl} size="md" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link href={href} title={space.name} className="-my-3 truncate py-3 text-label text-ink underline-offset-4 hover:underline">{space.name}</Link>
                  <span className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">
                    <Chip tone={staff ? "info" : "neutral"}>{ROLE_LABELS[space.role]}</Chip>
                    {space.status === "PENDING" ? <Chip tone="warning">Waiting for approval</Chip> : null}
                    {space.status === "BLOCKED" ? <Chip tone="danger">Blocked</Chip> : null}
                    <span>Since {joined.format(space.joinedAt)}</span>
                  </span>
                  {space.soleOwner ? <span className="text-caption text-ink-muted">You&apos;re the only machine manager, so you can&apos;t leave yet.</span> : null}
                </div>
                {space.status === "BLOCKED" ? null : <LeaveSpaceButton spaceSlug={space.slug} spaceName={space.name} soleOwner={space.soleOwner} pending={space.status === "PENDING"} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
