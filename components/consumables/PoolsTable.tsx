"use client";

import { useState } from "react";
import Link from "next/link";
import { Chip, EmptyState } from "@/components/ui/display";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatQuantity } from "@/lib/consumables/math";
import { METERING_UNIT_LABELS } from "@/lib/machines/presets";
import type { PoolRow } from "@/lib/machines/queries";
import { PoolFilters, DEFAULT_POOL_FILTERS } from "./PoolFilters";
import { PoolColour, poolCost } from "./PoolSummary";
import { PoolFormDialog } from "./PoolFormDialog";
import { PoolLedgerDialog } from "./PoolLedgerDialog";

export function PoolsTable({ spaceSlug, currency, pools, canManage }: { spaceSlug: string; currency: string; pools: PoolRow[]; canManage: boolean }) {
  const [filters, setFilters] = useState(DEFAULT_POOL_FILTERS);
  const query = filters.query.trim().toLocaleLowerCase("en-GB");
  const shown = pools.filter((pool) =>
    (!query || [pool.material, pool.colour, pool.brand, pool.lotCode, pool.binding.label].some((value) => value.toLocaleLowerCase("en-GB").includes(query)))
    && (!filters.status || (filters.status === "low" ? pool.low : pool.isActive === (filters.status === "active")))
    && (!filters.binding || pool.binding.kind === filters.binding)
    && (!filters.visibility || pool.isPublic === (filters.visibility === "public")));
  return <div className="flex flex-col gap-5">
    <PoolFilters value={filters} onChange={setFilters} />
    <p role="status" className="text-caption text-ink-muted">{shown.length} of {pools.length} pools</p>
    {shown.length ? <Table label="Consumable pools"><THead><TR>
      <TH>Material</TH><TH>Colour</TH><TH>Brand / lot</TH><TH>Serves</TH><TH className="text-right">Remaining</TH><TH className="text-right">Low threshold</TH><TH className="text-right">Cost per unit</TH><TH>Visibility</TH>{canManage ? <TH>Actions</TH> : null}
    </TR></THead><TBody>{shown.map((pool) => {
      const unit = METERING_UNIT_LABELS[pool.unit].short;
      return <TR key={pool.id}>
        <TD><Link className="font-semibold underline-offset-4 hover:underline" href={`/dashboard/${spaceSlug}/consumables/${pool.id}`}>{pool.material}</Link>{!pool.isActive ? <div className="mt-1"><Chip>Retired</Chip></div> : null}</TD>
        <TD><PoolColour pool={pool} /></TD><TD><span className="block">{pool.brand || "No brand"}</span><span className="text-caption text-ink-muted">{pool.lotCode || "No lot"}</span></TD>
        <TD><span className="block text-caption text-ink-muted">{pool.binding.kind === "type" ? "Machine type" : pool.binding.kind === "machine" ? "Machine" : "Shared"}</span>{pool.binding.label}</TD>
        <TD className="text-right"><span className="whitespace-nowrap tabular-nums">{formatQuantity(pool.remainingQuantity)} {unit}</span>{pool.low ? <div className="mt-1"><Chip tone="warning">Low stock</Chip></div> : null}</TD>
        <TD className="whitespace-nowrap text-right tabular-nums">{pool.lowThreshold === null ? "No threshold" : `${formatQuantity(pool.lowThreshold)} ${unit}`}</TD><TD className="whitespace-nowrap text-right tabular-nums">{poolCost(pool, currency)} / {unit}</TD>
        <TD><Chip tone="outline">{pool.isPublic ? "Public" : "Staff only"}</Chip></TD>
        {canManage ? <TD><div className="flex flex-wrap gap-2"><PoolFormDialog spaceSlug={spaceSlug} currency={currency} pool={pool} />
          {pool.isActive ? <PoolLedgerDialog spaceSlug={spaceSlug} pool={pool} kind="restock" /> : null}</div></TD> : null}
      </TR>;
    })}</TBody></Table> : <EmptyState patch={!pools.length} mood={pools.length ? "sleepy" : undefined} title={pools.length ? "No pools match these filters" : "No consumable pools yet"}>
      {pools.length ? "Change the search or filters to see more stock." : canManage ? "Create a pool to track material and its stock history." : "A consumables manager can create the first pool."}
    </EmptyState>}
  </div>;
}
