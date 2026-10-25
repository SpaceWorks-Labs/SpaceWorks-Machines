import Link from "next/link";
import type { Metadata } from "next";
import { loadFaultsView } from "@/lib/views/app__dashboard__spaceSlug__maintenance__faults__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR, TruncatedTD } from "@/components/ui/table";
import { formatDate } from "@/lib/format/datetime";
import { FAULT_STATUS_LABELS, SEVERITY_LABELS } from "@/lib/upkeep/labels";

export const metadata: Metadata = { title: "Faults", robots: { index: false, follow: false } };

export default async function FaultsPage({ params, searchParams }: { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ status?: string }> }) {
  const view = await loadFaultsView({ params, searchParams });
  const { space } = view;
  return (
    <div className="flex flex-col gap-7 pb-4">
      <div><Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/maintenance`}>Back to maintenance</Link></Button></div>
      <SpacePageHeader space={space} title="Faults" description="Problems reported by makers and staff, from first report to resolution."
        actions={<Button asChild size="sm" variant="secondary"><Link href={view.all ? "?" : "?status=all"}>{view.all ? "Show open faults" : "Show every fault"}</Link></Button>} />
      {view.faults.length ? <Table label="Faults" long><THead><TR><TH>Fault</TH><TH>Machine</TH><TH>Severity</TH><TH>Status</TH><TH>Reported</TH></TR></THead>
        <TBody>{view.faults.map((fault) => (
          <TR key={fault.number}>
            <TD className="min-w-[14rem]"><Link className="break-words text-label underline underline-offset-4" href={`/dashboard/${space.slug}/maintenance/faults/${fault.number}`}>{fault.label} {fault.title}</Link></TD>
            <TruncatedTD text={fault.machine} />
            <TD><Chip size="sm" tone={SEVERITY_LABELS[fault.severity]!.tone}>{SEVERITY_LABELS[fault.severity]!.label}</Chip></TD>
            <TD><Chip size="sm" tone={FAULT_STATUS_LABELS[fault.status]!.tone}>{FAULT_STATUS_LABELS[fault.status]!.label}</Chip></TD>
            <TD className="whitespace-nowrap">{formatDate(fault.createdAt, space.timezone)}</TD>
          </TR>))}</TBody></Table>
        : <EmptyState mood="sleepy" title={view.all ? "No faults reported" : "No open faults"}>Makers report problems from a machine&rsquo;s public page; staff from the machine&rsquo;s upkeep.</EmptyState>}
    </div>
  );
}
