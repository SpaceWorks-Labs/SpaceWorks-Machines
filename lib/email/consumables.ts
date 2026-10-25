import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatQuantity } from "@/lib/consumables/math";
import { METERING_UNIT_LABELS } from "@/lib/machines/presets";
import { absoluteUrl, sendBrandedEmail } from "./message";

type LowStockPayload = { to: string; spaceId: string; poolId: string };

export function asLowStockPayload(value: Prisma.JsonValue): LowStockPayload | null {
  const p = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!p || typeof p.to !== "string" || p.to.length > 320 || typeof p.spaceId !== "string" || p.spaceId.length > 64 || typeof p.poolId !== "string" || p.poolId.length > 64) return null;
  return { to: p.to, spaceId: p.spaceId, poolId: p.poolId };
}

/** Staff alert: a pool is running low. Built at send time, so it reports the pool as it is now. */
export async function deliverLowStockAlert(payload: LowStockPayload, messageId: string): Promise<"sent" | "dropped"> {
  const pool = await prisma.consumablePool.findFirst({
    where: { id: payload.poolId, spaceId: payload.spaceId },
    select: { material: true, colour: true, brand: true, unit: true, remainingQuantity: true, lowThreshold: true, isActive: true, lowAlertedAt: true, space: { select: { name: true, slug: true } } },
  });
  // Restocked or retired before the email went out: nothing to say any more.
  if (!pool || !pool.isActive || !pool.lowAlertedAt) return "dropped";
  const unit = METERING_UNIT_LABELS[pool.unit].short;
  const label = [pool.brand, pool.material, pool.colour].filter(Boolean).join(" ");
  await sendBrandedEmail({
    to: payload.to, messageId,
    subject: `${pool.space.name}: ${label} is running low`,
    heading: "Running low",
    paragraphs: [
      `${label} has ${formatQuantity(pool.remainingQuantity.toString())} ${unit} left${pool.lowThreshold ? `, at or below the ${formatQuantity(pool.lowThreshold.toString())} ${unit} you set as low` : ""}.`,
      "Restock it, or retire the pool if it's finished, from the Consumables page.",
    ],
    action: { label: "Open consumables", url: absoluteUrl(`/dashboard/${pool.space.slug}/consumables`) },
  });
  return "sent";
}
