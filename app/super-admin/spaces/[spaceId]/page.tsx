import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminSpaceDetailView } from "@/lib/views/app__super-admin__spaces__spaceId__page";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminPanel, LinkRow, MetricRows, NameCell } from "@/components/super-admin/AdminPanel";
import { AuditTable } from "@/components/super-admin/AuditTable";
import { SpaceStatusChip } from "@/components/space/SpaceStatusChip";
import { ReviewHistory } from "@/components/super-admin/ReviewHistory";
import { formatBytes } from "@/lib/superAdminInsights";
import { SpaceDecisionPanel } from "@/components/super-admin/SpaceDecisionPanel";
import { SpaceLimitsForm } from "@/components/super-admin/SpaceLimitsForm";
import { OwnerInviteResend } from "@/components/super-admin/OwnerInviteResend";
import { SpaceVisibilityToggle } from "@/components/super-admin/SpaceVisibilityToggle";
import { ROLE_LABELS } from "@/lib/permissionRoles";
import { Chip, SpaceLogo, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type Props = {
  params: Promise<{ spaceId: string }>;
};

export default async function SuperAdminSpaceDetailPage({ params }: Props) {
  await requireSuperAdmin();
  const { space, reviews, members, invites, assetStats, auditEvents, now } = await loadSuperAdminSpaceDetailView({ params });
  const address = [space.addressLine, space.city, space.region, space.postalCode, space.country].filter(Boolean).join(", ");
  const hasOwner = members.some((m) => m.role === "MACHINE_MANAGER");
  const ownerInviteEmail = invites.find((invite) => invite.role === "MACHINE_MANAGER" && invite.email)?.email ?? "";
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link href="/super-admin/spaces" className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
          <ArrowLeft aria-hidden className="size-4" />
          Spaces
        </Link>
        <div className="flex items-center gap-4">
          <SpaceLogo name={space.name} src={space.logoUrl} size="lg" />
          <div className="min-w-0">
            <h1 className="break-words text-h1 text-ink">{space.name}</h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              {space.source === "SUPERADMIN" ? "Added by a platform admin" : "Applied"} on {space.createdAt.toLocaleDateString("en-GB")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <SpaceStatusChip status={space.status} size="md" />
          <Chip tone="outline" className="tabular-nums">{`/s/${space.slug}`}</Chip>
          <Chip tone="outline">{`${space._count.members} on the team`}</Chip>
          {space.visibility === "PUBLIC" ? <Chip tone="outline">Listed publicly</Chip> : null}
        </div>
        {space.status === "ACTIVE" ? (
          <LinkRow links={[{ href: `/s/${space.slug}`, label: "Public page" }, { href: `/dashboard/${space.slug}`, label: "Space dashboard" }]} />
        ) : null}
      </header>

      <SpaceDecisionPanel spaceId={space.id} status={space.status} />
      {!hasOwner && space.status !== "REJECTED" ? <OwnerInviteResend spaceId={space.id} defaultEmail={ownerInviteEmail} /> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminPanel title="Application details">
          <MetricRows
            rows={[
              { label: "Contact email", value: space.contactEmail ?? "—" },
              { label: "Contact phone", value: space.contactPhone ?? "—" },
              { label: "Website", value: space.website ?? "—" },
              { label: "Address", value: address || "—" },
            ]}
          />
          <p className="mt-4 whitespace-pre-wrap text-body-ui text-ink-secondary">{space.description || "No description given."}</p>
        </AdminPanel>
        <AdminPanel title="Review history" description="Every decision, newest first.">
          <ReviewHistory reviews={reviews} />
        </AdminPanel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-2 content-start gap-3">
          <StatTile className="rounded-xl" label="Team" value={space._count.members.toLocaleString("en-IN")} />
          <StatTile className="rounded-xl" label="Stored files" value={assetStats._count._all.toLocaleString("en-IN")} hint={formatBytes(assetStats._sum.byteSize == null ? 0 : Number(assetStats._sum.byteSize))} />
        </div>
        <div className="flex flex-col gap-6">
          <SpaceVisibilityToggle spaceId={space.id} visibility={space.visibility} active={space.status === "ACTIVE"} />
          <SpaceLimitsForm spaceId={space.id} memberLimit={space.memberLimit} staffLimit={space.staffLimit} />
        </div>
      </div>

      <AdminPanel title="Team">
        <Table label="Team">
          <THead>
            <tr>
              <TH>Person</TH>
              <TH>Role</TH>
              <TH>Joined</TH>
            </tr>
          </THead>
          <TBody>
            {members.length === 0 ? (
              <tr><TD colSpan={3} className="py-6 text-center text-ink-muted">No one on the team yet.</TD></tr>
            ) : (
              members.map((m) => (
                <TR key={m.id}>
                  <TD><NameCell href={`/super-admin/users/${m.user.id}`} name={m.user.name ?? m.user.email ?? "—"} sub={m.user.email ?? undefined} /></TD>
                  <TD><Chip size="sm" tone={m.role === "MACHINE_MANAGER" ? "ink" : "neutral"}>{ROLE_LABELS[m.role]}</Chip></TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{m.createdAt.toLocaleDateString("en-GB")}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Team invites">
        <Table label="Team invites">
          <THead>
            <tr>
              <TH>Role</TH>
              <TH>For</TH>
              <TH>State</TH>
              <TH>Created</TH>
            </tr>
          </THead>
          <TBody>
            {invites.length === 0 ? (
              <tr><TD colSpan={4} className="py-6 text-center text-ink-muted">No invites.</TD></tr>
            ) : (
              invites.map((invite) => (
                <TR key={invite.id}>
                  <TD>{ROLE_LABELS[invite.role]}</TD>
                  <TD className="text-sm">{invite.email ?? "Anyone with the link"}</TD>
                  <TD>{invite.usedAt ? `Used by ${invite.usedBy?.email ?? "someone"}` : invite.expiresAt && invite.expiresAt <= now ? "Expired" : "Open"}</TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{invite.createdAt.toLocaleDateString("en-GB")}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Recent audit log">
        <AuditTable events={auditEvents} label="Recent audit log" hideSpace />
      </AdminPanel>
    </div>
  );
}
