import type { Metadata } from "next";
import { loadPricingRulesView } from "@/lib/views/app__dashboard__spaceSlug__machine-settings__pricing__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { PricingRuleDialog } from "@/components/jobs/PricingRuleDialog";
import { Card, EmptyState } from "@/components/ui/display";
import { words } from "@/lib/jobs/presentation";

export const metadata: Metadata = { title: "Pricing rules", robots: { index: false, follow: false } };
export default async function PricingRulesPage(props: Parameters<typeof loadPricingRulesView>[0]) {
  const view = await loadPricingRulesView(props);
  const options = { spaceSlug: view.space.slug, currency: view.space.currency, types: view.types, machines: view.machines, allowSpaceDefault: view.allowSpaceDefault };
  return <div className="flex flex-col gap-6"><SpacePageHeader space={view.space} title="Pricing rules" description="Space defaults and prices for each type, machine and audience." actions={<PricingRuleDialog {...options} />} />
    {view.rules.length ? view.rules.map((r) => <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-title">{r.machineId ? view.machines.find((m) => m.id === r.machineId)?.name : r.typeId ? view.types.find((t) => t.id === r.typeId)?.name : "Space default"}</h2><p>{words(r.audience)} · {words(r.mode)}</p></div><PricingRuleDialog {...options} rule={{ ...r, ruleId: r.id }} /></Card>) : <EmptyState title="No pricing rules">Jobs are free until you add a pricing rule and enable payments in space settings.</EmptyState>}
  </div>;
}
