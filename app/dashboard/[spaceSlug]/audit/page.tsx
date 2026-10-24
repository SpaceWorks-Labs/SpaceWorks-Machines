import type { Metadata } from "next";
import { loadAuditView } from "@/lib/views/app__dashboard__spaceSlug__audit__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { AuditFilters } from "@/components/forms/FilterForms";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AUDIT_AREAS } from "@/lib/auditAreas";
import { formatDayTime } from "@/lib/format/datetime";

export const metadata: Metadata = { title: "Audit log", robots: { index: false, follow: false } };
type Props = { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ actor?: string; area?: string; from?: string; to?: string }> };

export default async function AuditPage({ params, searchParams }: Props) {
  const { space, rows, filters, people } = await loadAuditView({ params, searchParams });
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
  return (
    <div className="flex flex-col gap-7 pb-4">
      <SpacePageHeader space={space} title="Audit log" description="Who changed what in this space. Entries can't be edited or deleted."
        actions={<Button asChild size="sm" variant="secondary"><a href={`/api/spaces/${space.slug}/audit${query ? `?${query}` : ""}`} download>Export CSV</a></Button>} />
      <AuditFilters filters={filters} people={people} areas={AUDIT_AREAS} />
      {rows.length ? <Table label="Audit events"><THead><TR><TH>When</TH><TH>Who</TH><TH>What</TH><TH>Details</TH></TR></THead>
        <TBody>{rows.map((row) => <TR key={row.id}>
          <TD className="whitespace-nowrap">{formatDayTime(row.createdAt, space.timezone)}</TD><TD>{row.actor}</TD>
          <TD><code>{row.action}</code><span className="block text-caption text-ink-muted">{row.target}</span></TD>
          <TD className="max-w-md break-words text-caption">{row.detail}</TD>
        </TR>)}</TBody></Table> : <EmptyState title="Nothing matches">Try a wider date range or another area.</EmptyState>}
    </div>
  );
}
