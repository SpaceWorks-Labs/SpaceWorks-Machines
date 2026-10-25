import Link from "next/link";
import type { Metadata } from "next";
import { loadMachinePrinterView } from "@/lib/views/app__dashboard__spaceSlug__machines__machineSlug__printer__page";
import { savePrinterAction } from "@/app/actions/integrations";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Chip, DetailList, ProgressBar } from "@/components/ui/display";
import { PrinterFields } from "@/components/printers/PrinterFields";
import { MachineStatusChip } from "@/components/machines/MachineStatusChip";
import { ActionDialog } from "@/components/upkeep/ActionDialog";
import { AutoRefresh, PrinterControls } from "@/components/printers/PrinterControls";
import { formatDayTime } from "@/lib/format/datetime";

export const metadata: Metadata = { title: "Printer connection", robots: { index: false, follow: false } };
const STATE = { idle: ["Idle", "neutral"], printing: ["Printing", "info"], paused: ["Paused", "warning"], error: ["Error", "danger"], offline: ["Offline", "neutral"] } as const;
const minutes = (seconds: number | null) => seconds === null ? "None" : seconds < 120 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;

export default async function MachinePrinterPage({ params }: { params: Promise<{ spaceSlug: string; machineSlug: string }> }) {
  const { space, machine, adapters, connection, telemetry } = await loadMachinePrinterView({ params });
  const settings = connection?.settings ?? { pollSeconds: 15, syncMachineStatus: true, autoCompleteJobs: true };
  const live = connection?.enabled && connection.adapter !== "MANUAL";
  return (
    <div className="flex flex-col gap-7 pb-4">
      {live ? <AutoRefresh seconds={5} /> : null}
      <div><Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/machines/${machine.slug}`}>Back to {machine.name}</Link></Button></div>
      <SpacePageHeader space={space} title={`Printer: ${machine.name}`} description="Connect the machine so jobs start on the printer and finish from its telemetry."
        actions={<><MachineStatusChip status={machine.status} />
          <ActionDialog action={savePrinterAction} fixed={{ spaceSlug: space.slug, machineId: machine.id }} booleans={["enabled", "syncMachineStatus", "autoCompleteJobs"]}
            trigger={connection ? "Edit connection" : "Set up connection"} triggerVariant="primary" title="Printer connection" submitLabel="Save connection" success="Connection saved">
            <PrinterFields adapters={adapters.filter((adapter) => adapter.available).map((adapter) => ({ kind: adapter.kind, label: adapter.label }))}
              connection={connection ? { adapter: connection.adapter, baseUrl: connection.baseUrl, deviceId: connection.deviceId, hasSecret: connection.hasSecret, enabled: connection.enabled } : null} settings={settings} />
          </ActionDialog></>} />

      {connection && telemetry ? <Card as="section" aria-label="Live telemetry">
        <CardHeader title="Live telemetry" description={connection.lastSeenAt ? `Last checked ${formatDayTime(connection.lastSeenAt, space.timezone)}` : "Not checked yet."}
          action={<Chip tone={STATE[telemetry.state][1]}>{STATE[telemetry.state][0]}</Chip>} />
        {connection.lastError ? <p role="alert" className="mb-3 break-words text-caption text-danger-fg">{connection.lastError}</p> : null}
        {telemetry.progress !== null ? <ProgressBar value={telemetry.progress} max={100} label={`Progress ${telemetry.progress} %`} className="mb-4" /> : null}
        <DetailList items={[
          { label: "Print", value: telemetry.jobName ?? "None" },
          { label: "Nozzle", value: telemetry.nozzleC === null ? "No reading" : `${telemetry.nozzleC} °C of ${telemetry.nozzleTargetC ?? 0} °C` },
          { label: "Bed", value: telemetry.bedC === null ? "No reading" : `${telemetry.bedC} °C of ${telemetry.bedTargetC ?? 0} °C` },
          { label: "Elapsed", value: minutes(telemetry.elapsedSeconds) }, { label: "Remaining", value: minutes(telemetry.remainingSeconds) },
          ...(telemetry.error ? [{ label: "Error", value: telemetry.error }] : []),
        ]} />
        {connection.adapter !== "MANUAL" ? <div className="mt-4"><PrinterControls spaceSlug={space.slug} connectionId={connection.id}
          commands={connection.adapter === "SIMULATED" ? ["test", "start", "pause", "resume", "cancel", "fail"] : ["test"]} /></div> : null}
      </Card> : null}

      {connection ? <Card as="section" aria-label="Command log">
        <CardHeader title="Command log" />
        {connection.commands.length ? <ul className="flex flex-col divide-y divide-line">{connection.commands.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="min-w-0 break-words"><code>{row.command}</code> <span className="text-caption text-ink-muted">{row.message}</span></span>
          <span className="flex shrink-0 items-center gap-2"><Chip size="sm" tone={row.ok ? "success" : "danger"}>{row.ok ? "Done" : "Refused"}</Chip><span className="text-caption text-ink-muted">{formatDayTime(row.createdAt, space.timezone)}</span></span>
        </li>)}</ul> : <p className="text-body-ui text-ink-muted">No commands yet. Commands you send appear here.</p>}
      </Card> : null}

      <section aria-labelledby="connection-types" className="flex flex-col gap-4">
        <h2 id="connection-types" className="text-title text-ink">Connection types</h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {adapters.map((adapter) => <li key={adapter.kind}><Card className={adapter.available ? "h-full" : "h-full bg-surface"}>
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 text-title text-ink">{adapter.label}</h3>
              {!adapter.available ? <Chip size="sm" tone="outline">Coming soon</Chip> : connection?.adapter === adapter.kind ? <Chip size="sm" tone="success">In use</Chip> : null}</div>
            <p className="mt-2 text-body-ui text-ink-secondary">{adapter.description}</p>
          </Card></li>)}
        </ul>
      </section>
    </div>
  );
}
