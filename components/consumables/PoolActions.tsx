import type { PoolRow } from "@/lib/machines/queries";
import { PoolFormDialog } from "./PoolFormDialog";
import { PoolLedgerDialog } from "./PoolLedgerDialog";
import { PoolPublicDialog } from "./PoolPublicDialog";

export function PoolActions({ spaceSlug, currency, pool, money = false }: { spaceSlug: string; currency: string; pool: PoolRow; money?: boolean }) {
  return <div className="flex flex-wrap gap-2">
    <PoolFormDialog spaceSlug={spaceSlug} currency={currency} pool={pool} />
    {pool.isActive ? <>
      <PoolLedgerDialog spaceSlug={spaceSlug} pool={pool} kind="restock" money={money} />
      <PoolLedgerDialog spaceSlug={spaceSlug} pool={pool} kind="correction" />
      <PoolLedgerDialog spaceSlug={spaceSlug} pool={pool} kind="retire" />
      <PoolPublicDialog spaceSlug={spaceSlug} pool={pool} />
    </> : null}
  </div>;
}
