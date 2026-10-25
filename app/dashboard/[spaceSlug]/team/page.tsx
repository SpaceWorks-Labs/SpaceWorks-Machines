import Link from "next/link";
import type { Metadata } from "next";
import { loadSpaceTeamView } from "@/lib/views/app__dashboard__spaceSlug__team__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { SpaceInviteLinkPanel } from "@/components/team/SpaceInviteLinkPanel";
import { MemberStat, RolesCard } from "@/components/team/MemberSections";
import { MakersList } from "@/components/team/MakersList";
import { TeamList } from "@/components/team/TeamList";
import { roleBreakdown, roleDots } from "@/components/team/memberSummary";
import { Button } from "@/components/ui/button";
import { JOIN_POLICY_LABELS } from "@/lib/joinPolicy";

type Props = { params: Promise<{ spaceSlug: string; }>; searchParams: Promise<{ page?: string; }>; };

export const metadata: Metadata = { title: "Team", description: "Staff, makers and invites." };

export default async function SpaceTeamPage({ params, searchParams }: Props) {
  const view = await loadSpaceTeamView({ params, searchParams });
  const { space, membership, managerView } = view;
  return (
    <div className="flex flex-col gap-7 pb-4">
      <SpacePageHeader space={space} title="Team" description={`The people who run ${space.name}, and the makers who use it.`}
        actions={managerView && view.assignable.length ? <Button asChild variant="primary" className="lg:hidden"><a href="#invite-title">Invite people</a></Button> : undefined} />

      <section aria-label="People at a glance" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MemberStat label="Staff" value={view.staffCount} hint={roleBreakdown(view.roleCounts)} dots={roleDots(view.roleCounts)} />
        <MemberStat label="Makers" value={view.makerTotal} hint={`${view.recentMakers} joined in the last 30 days`} />
        <MemberStat label="Waiting for approval" value={view.pendingCount} hint={JOIN_POLICY_LABELS[space.joinPolicy]} />
      </section>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <TeamList spaceSlug={space.slug} actorRole={membership.role} rows={view.rows} showEmail={managerView} types={view.types} canAssignTypes={view.canAssignTypes} />
          <MakersList spaceSlug={space.slug} rows={view.makerRows} canManage={view.canManageMembers} total={view.makerTotal} />
          {view.makerPages > 1 ? (
            <nav aria-label="Maker pages" className="flex flex-wrap items-center justify-end gap-2">
              <p className="text-sm text-ink-muted">Page {view.makerPage} of {view.makerPages}</p>
              {view.makerPage <= 1 ? <Button size="sm" variant="secondary" disabled>Previous</Button> : <Button asChild size="sm" variant="secondary"><Link href={`?page=${view.makerPage - 1}`}>Previous</Link></Button>}
              {view.makerPage >= view.makerPages ? <Button size="sm" variant="secondary" disabled>Next</Button> : <Button asChild size="sm" variant="secondary"><Link href={`?page=${view.makerPage + 1}`}>Next</Link></Button>}
            </nav>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          {managerView && view.assignable.length ? <SpaceInviteLinkPanel spaceSlug={space.slug} baseUrl={view.baseUrl} invites={view.invites} roles={view.assignable} /> : null}
          <RolesCard />
        </aside>
      </div>
    </div>
  );
}
