import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminSpacesView } from "@/lib/views/app__super-admin__spaces__page";
import { AdminPager, AdminSearchForm, NameCell } from "@/components/super-admin/AdminPanel";
import { SPACE_STATUS_LABELS, SpaceStatusChip } from "@/components/space/SpaceStatusChip";
import { buttonClasses } from "@/components/ui/button";
import { SpaceApplicationsControl } from "@/components/super-admin/SpaceApplicationsControl";
import { PageHeader } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";

type Props = {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
};

export default async function SuperAdminSpacesPage({ searchParams }: Props) {
  await requireSuperAdmin();
  const { applicationsOpen, q, status, page, spaces, total, counts } = await loadSuperAdminSpacesView({ searchParams });
  const chip = (href: string, label: string, count: number, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
        active ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-panel text-ink hover:bg-muted",
      )}
    >
      {label} <span className="tabular-nums">{count}</span>
    </Link>
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Spaces"
        description="Every space on this platform. Applications wait under review until you decide."
        actions={
          <Link href="/super-admin/spaces/new" className={buttonClasses({ variant: "primary" })}>
            <Plus aria-hidden className="size-4" />
            Add space
          </Link>
        }
      />
      <SpaceApplicationsControl initialEnabled={applicationsOpen} />
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {chip("/super-admin/spaces", "All", total, status === null)}
        {counts.filter((row) => row.count > 0 || row.status === "PENDING_REVIEW").map((row) =>
          chip(`/super-admin/spaces?status=${row.status}`, SPACE_STATUS_LABELS[row.status], row.count, status === row.status),
        )}
      </nav>
      <AdminSearchForm action="/super-admin/spaces" label="Search by name, address or contact email" defaultValue={q}>
        {status ? <input type="hidden" name="status" value={status} /> : null}
      </AdminSearchForm>

      <Table label="Spaces" long>
        <THead>
          <tr>
            <TH>Space</TH>
            <TH>Status</TH>
            <TH className="text-right">Team</TH>
            <TH>{status === "PENDING_REVIEW" ? "Waiting since" : "Created"}</TH>
          </tr>
        </THead>
        <TBody>
          {spaces.length === 0 ? (
            <tr><TD colSpan={4} className="py-8 text-center text-ink-muted">{status ? "No spaces with this status." : "No spaces yet."}</TD></tr>
          ) : (
            spaces.map((o) => (
              <TR key={o.id}>
                <TD><NameCell href={`/super-admin/spaces/${o.id}`} name={o.name} sub={[`/s/${o.slug}`, o.city].filter(Boolean).join(" · ")} /></TD>
                <TD><SpaceStatusChip status={o.status} /></TD>
                <TD className="text-right tabular-nums">{o._count.members}</TD>
                <TD className="whitespace-nowrap text-ink-secondary">{(status === "PENDING_REVIEW" ? o.updatedAt : o.createdAt).toLocaleDateString("en-GB")}</TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      <AdminPager basePath="/super-admin/spaces" query={q} page={page} extra={status ? `&status=${status}` : ""} />
    </div>
  );
}
