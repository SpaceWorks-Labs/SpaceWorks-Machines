import { Chip, type ChipTone } from "@/components/ui/display";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { formatDate } from "@/lib/format/datetime";
import type { HistoryEntry } from "@/lib/upkeep/history";

const KIND: Record<HistoryEntry["kind"], { label: string; tone: ChipTone }> = {
  maintenance: { label: "Maintenance", tone: "success" }, downtime: { label: "Downtime", tone: "warning" }, fault: { label: "Fault", tone: "danger" },
  status: { label: "Status", tone: "neutral" }, warranty: { label: "Warranty", tone: "info" }, usage: { label: "Usage", tone: "accent" },
};

/** The machine's merged timeline, newest first. It repeats the sections above, so it starts folded. */
export function ServiceHistory({ entries, timeZone }: { entries: HistoryEntry[]; timeZone: string }) {
  return (
    <CollapsibleSection id="upkeep-history" title="Service history" count={entries.length} startOpen={false} description="Maintenance, downtime, faults, status changes, warranty and usage milestones.">
      {entries.length ? <ol className="flex flex-col divide-y divide-line">{entries.map((entry, index) => (
        <li key={`${entry.at}-${index}`} className="flex flex-wrap items-start gap-3 py-2">
          <span className="w-28 shrink-0 text-caption text-ink-muted">{formatDate(entry.at, timeZone)}</span>
          <Chip size="sm" tone={KIND[entry.kind].tone}>{KIND[entry.kind].label}</Chip>
          <span className="min-w-0 flex-1 basis-48"><span className="break-words text-label">{entry.title}</span>{entry.detail ? <span className="block text-caption text-ink-muted">{entry.detail}</span> : null}</span>
        </li>))}</ol> : <p className="text-body-ui text-ink-muted">Nothing has happened to this machine yet.</p>}
    </CollapsibleSection>
  );
}
