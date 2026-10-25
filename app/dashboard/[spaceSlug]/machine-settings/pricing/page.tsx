import Link from "next/link";
import type { Metadata } from "next";
import { loadPricingRulesView } from "@/lib/views/app__dashboard__spaceSlug__machine-settings__pricing__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { PricingRuleDialog } from "@/components/jobs/PricingRuleDialog";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/display";
import { words } from "@/lib/jobs/presentation";

export const metadata: Metadata = { title: "Pricing rules", robots: { index: false, follow: false } };
export default async function PricingRulesPage(props: Parameters<typeof loadPricingRulesView>[0]) {
  const view = await loadPricingRulesView(props);
  const options = { spaceSlug: view.space.slug, currency: view.space.currency, types: view.types, machines: view.machines, allowSpaceDefault: view.allowSpaceDefault };
  return <div className="flex flex-col gap-7 pb-4"><div><Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${view.space.slug}/machine-settings`}>Back to machine settings</Link></Button></div>
    <SpacePageHeader space={view.space} title="Pricing rules" description="Space defaults and prices for each type, machine and audience." actions={<PricingRuleDialog {...options} />} />
    {view.rules.length ? <ul aria-label="Pricing rules" className="flex flex-col gap-3">{view.rules.map((r) => <li key={r.id}><Card className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-title text-ink">{(r.machineId ? view.machines.find((m) => m.id === r.machineId)?.name : r.typeId ? view.types.find((t) => t.id === r.typeId)?.name : "Space default") ?? "Removed machine or type"}</h2><p className="mt-1 text-body-ui text-ink-secondary">{words(r.audience)} · {words(r.mode)}</p></div><PricingRuleDialog {...options} rule={{ ...r, ruleId: r.id }} /></Card></li>)}</ul> : <EmptyState title="No pricing rules" mood="sleepy">Jobs are free until you add a pricing rule and enable payments in space settings.</EmptyState>}
  </div>;
}
