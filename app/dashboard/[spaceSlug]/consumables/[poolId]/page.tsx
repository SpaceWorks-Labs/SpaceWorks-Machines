import Link from "next/link";
import type { Metadata } from "next";
import { loadConsumablePoolView } from "@/lib/views/app__dashboard__spaceSlug__consumables__poolId__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { PoolSummary } from "@/components/consumables/PoolSummary";
import { PoolActions } from "@/components/consumables/PoolActions";
import { PoolLedger } from "@/components/consumables/PoolLedger";
import { METERING_UNIT_LABELS } from "@/lib/machines/presets";

export const metadata: Metadata = { title: "Consumable pool", robots: { index: false, follow: false } };

export default async function ConsumablePoolPage(props: { params: Promise<{ spaceSlug: string; poolId: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const view = await loadConsumablePoolView(props);
  const { space, pool } = view;
  return <div className="flex flex-col gap-7 pb-4">
    <div><Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/consumables`}>Back to consumables</Link></Button></div>
    <SpacePageHeader space={space} title={pool.material} description={[pool.colour, pool.brand, pool.lotCode].filter(Boolean).join(" · ")} />
    <Card as="section" aria-label="Pool details"><PoolSummary pool={pool} spaceSlug={space.slug} currency={space.currency} />
      {view.canManage ? <div className="mt-5"><PoolActions spaceSlug={space.slug} currency={space.currency} pool={pool} money={view.canFinance} /></div> : null}</Card>
    <PoolLedger spaceSlug={space.slug} poolId={pool.id} unit={METERING_UNIT_LABELS[pool.unit].short} entries={view.ledger} page={view.page} hasMore={view.hasMore} timezone={space.timezone} />
  </div>;
}
