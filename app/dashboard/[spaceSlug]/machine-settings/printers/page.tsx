import Link from "next/link";
import type { Metadata } from "next";
import { loadPrintersView } from "@/lib/views/app__dashboard__spaceSlug__machine-settings__printers__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR, TruncatedTD } from "@/components/ui/table";

export const metadata: Metadata = { title: "Printer connections", robots: { index: false, follow: false } };
const STATE = { UNCONFIGURED: ["Not checked yet", "neutral"], CONNECTED: ["Connected", "success"], DISCONNECTED: ["Disconnected", "warning"], ERROR: ["Error", "danger"] } as const;

export default async function PrintersPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { space, machines } = await loadPrintersView({ params });
  return (
    <div className="flex flex-col gap-7 pb-4">
      <div><Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/machine-settings`}>Back to machine settings</Link></Button></div>
      <SpacePageHeader space={space} title="Printer connections" description="Which machines talk to their printer. Simulated and manual connections work today; network printers are coming soon." />
      {machines.length ? <Table label="Printer connections"><THead><TR><TH>Machine</TH><TH>Type</TH><TH>Connection</TH><TH>State</TH><TH><span className="sr-only">Actions</span></TH></TR></THead>
        <TBody>{machines.map((machine) => <TR key={machine.slug}>
          <TruncatedTD text={machine.name} className="font-semibold" /><TruncatedTD text={machine.type} className="max-w-[12rem]" /><TD className="whitespace-nowrap">{machine.connection ? `${machine.connection.label}${machine.connection.enabled ? "" : " (off)"}` : <span className="text-ink-muted">Not set up</span>}</TD>
          <TD>{machine.connection ? <Chip size="sm" tone={STATE[machine.connection.state][1]}>{STATE[machine.connection.state][0]}</Chip> : null}</TD>
          <TD className="text-right"><Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/machines/${machine.slug}/printer`} aria-label={`${machine.connection ? "Open printer for" : "Set up printer for"} ${machine.name}`}>{machine.connection ? "Open" : "Set up"}</Link></Button></TD>
        </TR>)}</TBody></Table> : <EmptyState title="No machines yet" mood="sleepy">Add machines first, then connect their printers here.</EmptyState>}
    </div>
  );
}
