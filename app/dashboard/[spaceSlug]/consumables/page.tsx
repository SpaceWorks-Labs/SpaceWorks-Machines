import type { Metadata } from "next";
import { loadConsumablesView } from "@/lib/views/app__dashboard__spaceSlug__consumables__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { PoolFormDialog } from "@/components/consumables/PoolFormDialog";
import { PoolsTable } from "@/components/consumables/PoolsTable";
import { LowStockAlerts } from "@/components/consumables/LowStockAlerts";

export const metadata: Metadata = { title: "Consumables", robots: { index: false, follow: false } };

export default async function ConsumablesPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const view = await loadConsumablesView({ params });
  return <div className="flex flex-col gap-7 pb-4">
    <SpacePageHeader space={view.space} title="Consumables" description="Material pools, stock levels and a record of every adjustment."
      actions={view.canManage ? <PoolFormDialog spaceSlug={view.space.slug} currency={view.space.currency} choices={{ types: view.types, machines: view.machines }} /> : null} />
    <PoolsTable spaceSlug={view.space.slug} currency={view.space.currency} pools={view.pools} canManage={view.canManage} />
    <LowStockAlerts spaceSlug={view.space.slug} enabled={view.lowStockAlerts} canConfigure={view.canConfigureAlerts} />
  </div>;
}
