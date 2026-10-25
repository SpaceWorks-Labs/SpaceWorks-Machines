import type { Metadata } from "next";
import { loadTechniciansView } from "@/lib/views/app__dashboard__spaceSlug__technicians__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { TechnicianDialog, TechnicianImportDialog } from "@/components/repairs/TechnicianDialog";
import { Callout, Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata: Metadata = { title: "Technicians", robots: { index: false, follow: false } };

export default async function TechniciansPage(props: Parameters<typeof loadTechniciansView>[0]) {
  const view = await loadTechniciansView(props);
  const { space } = view;
  return <div className="flex flex-col gap-7 pb-4">
    <SpacePageHeader space={space} title="Technicians" description="Everyone you can ask to fix a machine: your staff technicians and outside contacts, with their skills."
      actions={view.canManage ? <><TechnicianImportDialog spaceSlug={space.slug} /><TechnicianDialog spaceSlug={space.slug} staff={view.staffCandidates} /></> : null} />
    {!view.providers.whatsapp && !view.providers.telegram ? <Callout tone="info" title="Email only for now">
      Requests also go out by WhatsApp or Telegram once the space has that chat channel set up in Space settings, then Notifications.</Callout> : null}
    {view.technicians.length ? <Table label="Technicians" long><THead><TR><TH>Name</TH><TH>Kind</TH><TH>Skills</TH><TH>Reach them by</TH><TH>Repairs</TH><TH><span className="sr-only">Actions</span></TH></TR></THead>
      <TBody>{view.technicians.map((row) => <TR key={row.id}>
        <TD><span className="flex flex-wrap items-center gap-2"><span className="font-bold">{row.name}</span>{row.isActive ? null : <Chip size="sm" tone="outline">Inactive</Chip>}</span></TD>
        <TD>{row.kind === "STAFF" ? "Staff" : "Outside"}</TD>
        <TD className="min-w-[10rem]">{row.skills.length ? <span className="flex flex-wrap gap-1">{row.skills.map((skill) => <Chip key={skill} size="sm">{skill}</Chip>)}</span> : <span className="text-ink-muted">None listed</span>}</TD>
        <TD>{[row.email && "Email", row.whatsapp && "WhatsApp", row.telegramChatId && "Telegram"].filter(Boolean).join(", ") || <span className="text-ink-muted">{row.kind === "STAFF" ? "Inbox" : "Not set"}</span>}</TD>
        <TD className="tabular-nums">{row.repairs}</TD>
        <TD>{view.canManage ? <TechnicianDialog spaceSlug={space.slug} staff={view.staffCandidates} technician={row} /> : null}</TD>
      </TR>)}</TBody></Table>
      : <EmptyState patch title="No technicians yet">Add the people who fix your machines, then ask them from any fault.</EmptyState>}
  </div>;
}
