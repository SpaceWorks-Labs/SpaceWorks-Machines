import type { Metadata } from "next";
import { loadRepairLinkView } from "@/lib/views/app__r__token__page";
import { RepairLinkPanel } from "@/components/repairs/RepairLinkPanel";

export const metadata: Metadata = { title: "Repair request", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function RepairLinkPage(props: Parameters<typeof loadRepairLinkView>[0]) {
  const view = await loadRepairLinkView(props);
  return <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-[760px] flex-col gap-6 px-5 py-12">
    <div className="flex flex-col gap-2">
      <p className="text-caption text-ink-secondary">{view.space} · repair request for {view.technician}</p>
      <h1 className="text-h1">{view.machine}</h1>
      <p className="text-body-ui text-ink-secondary">{view.fault.label} · {view.fault.severity.toLowerCase()} · {view.fault.title}</p>
    </div>
    {view.fault.description ? <p className="whitespace-pre-line">{view.fault.description}</p> : null}
    <RepairLinkPanel view={view} />
  </main>;
}
