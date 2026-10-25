import type { Metadata } from "next";
import { loadRepairLinkView } from "@/lib/views/app__r__token__page";
import { RepairLinkPanel } from "@/components/repairs/RepairLinkPanel";
import { Chip } from "@/components/ui/display";
import { SEVERITY_LABELS } from "@/lib/upkeep/labels";

export const metadata: Metadata = { title: "Repair request", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function RepairLinkPage(props: Parameters<typeof loadRepairLinkView>[0]) {
  const view = await loadRepairLinkView(props);
  return <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
    <div className="flex flex-col gap-2">
      <p className="break-words text-caption text-ink-secondary">{view.space} · repair request for {view.technician}</p>
      <h1 className="break-words text-h1 text-ink">{view.machine}</h1>
      <p className="flex flex-wrap items-center gap-2 text-body-ui text-ink-secondary"><span className="break-words">{view.fault.label} · {view.fault.title}</span>
        <Chip size="sm" tone={SEVERITY_LABELS[view.fault.severity]?.tone}>{SEVERITY_LABELS[view.fault.severity]?.label ?? view.fault.severity}</Chip></p>
    </div>
    {view.fault.description ? <p className="whitespace-pre-line break-words text-body-ui">{view.fault.description}</p> : null}
    <RepairLinkPanel view={view} />
  </main>;
}
