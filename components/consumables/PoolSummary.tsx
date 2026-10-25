import Link from "next/link";
import { Chip, DetailList } from "@/components/ui/display";
import { formatQuantity } from "@/lib/consumables/math";
import { METERING_UNIT_LABELS } from "@/lib/machines/presets";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";
import type { PoolRow } from "@/lib/machines/queries";

export function PoolColour({ pool }: { pool: { colour: string; colourHex: string } }) {
  return <span className="inline-flex items-center gap-2">
    {/^#[0-9a-f]{6}$/i.test(pool.colourHex) ? <span aria-hidden className="size-4 shrink-0 rounded-full border border-line-strong" style={{ backgroundColor: pool.colourHex }} /> : null}
    {pool.colour || pool.colourHex || "No colour"}
  </span>;
}

export function poolCost(pool: Pick<PoolRow, "costPerUnit">, currency: string) {
  return pool.costPerUnit !== null && isCurrencyCode(currency) ? formatMoney(pool.costPerUnit, currency) : "Not recorded";
}

export function PoolSummary({ pool, spaceSlug, currency }: { pool: PoolRow; spaceSlug: string; currency: string }) {
  const unit = METERING_UNIT_LABELS[pool.unit].short;
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap gap-2"><Chip tone={pool.isActive ? "success" : "neutral"}>{pool.isActive ? "Active" : "Retired"}</Chip>
      <Chip tone="outline">{pool.isPublic ? "Public" : "Staff only"}</Chip>{pool.low ? <Chip tone="warning">Low stock</Chip> : null}</div>
    <DetailList items={[
      { label: "Material", value: pool.material }, { label: "Colour", value: <PoolColour pool={pool} /> },
      { label: "Brand", value: pool.brand || "Not recorded" }, { label: "Lot", value: pool.lotCode || "Not recorded" },
      { label: "Serves", value: pool.binding.kind === "machine" ? <Link className="underline" href={`/dashboard/${spaceSlug}/machines/${pool.binding.slug}`}>Machine: {pool.binding.label}</Link> : `${pool.binding.kind === "type" ? "Type: " : "Shared: "}${pool.binding.label}` },
      { label: "Remaining", value: `${formatQuantity(pool.remainingQuantity)} ${unit}` },
      { label: "Low threshold", value: pool.lowThreshold === null ? "No threshold" : `${formatQuantity(pool.lowThreshold)} ${unit}` },
      { label: "Cost per unit", value: `${poolCost(pool, currency)} / ${unit}` },
    ]} />
  </div>;
}
