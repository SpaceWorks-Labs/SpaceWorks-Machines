import "server-only";

import type { ConsumableAdjustmentKind, Prisma } from "@prisma/client";
import { InsufficientStockError, lowStockTransition, nextBalance, toMilli, fromMilli, type Quantity } from "./math";
import { queueLowStockAlert } from "./alerts";

export class PoolNotFoundError extends Error {
  constructor() {
    super("Pool not found.");
  }
}

export type LockedPool = {
  id: string;
  spaceId: string;
  machineId: string | null;
  typeId: string | null;
  material: string;
  colour: string;
  unit: string;
  remainingQuantity: string;
  lowThreshold: string | null;
  lowAlertedAt: Date | null;
  isActive: boolean;
};

/** Lock one pool row of this space for the rest of the transaction. Another space's pool is "not found". */
export async function lockPool(tx: Prisma.TransactionClient, spaceId: string, poolId: string): Promise<LockedPool> {
  const rows = await tx.$queryRaw<LockedPool[]>`
    SELECT "id", "spaceId", "machineId", "typeId", "material", "colour", "unit"::text AS "unit",
           "remainingQuantity"::text AS "remainingQuantity", "lowThreshold"::text AS "lowThreshold", "lowAlertedAt", "isActive"
    FROM "ConsumablePool" WHERE "id" = ${poolId} AND "spaceId" = ${spaceId} FOR UPDATE`;
  const pool = rows[0];
  if (!pool) throw new PoolNotFoundError();
  return pool;
}

export type AdjustmentInput = {
  spaceId: string;
  poolId: string;
  kind: ConsumableAdjustmentKind;
  /** Signed; negative takes stock out. Zero writes nothing. */
  delta: Quantity;
  reason?: string;
  actorId?: string | null;
  jobId?: string | null;
  usageLogId?: string | null;
  /** Take what is there instead of refusing when the pool holds less than a decrease asks for. */
  clampToAvailable?: boolean;
  /** Retiring a pool never raises a low-stock alert. */
  silent?: boolean;
};

export type AdjustmentResult = {
  adjustmentId: string | null;
  delta: string;
  balanceAfter: string;
  /** What a clamped decrease could not take. */
  shortfall: string;
  lowStock: "alerted" | "cleared" | "unchanged";
  webhookDeliveryIds: string[];
};

/**
 * The only writer of pool balances. Locks the pool, applies the signed delta, appends the ledger row with
 * `balanceAfter`, and runs the low-stock rule: alert once on the crossing (email, chat and webhook, queued in
 * this transaction), clear the flag when a change lifts the pool above its threshold.
 */
export async function applyAdjustment(tx: Prisma.TransactionClient, input: AdjustmentInput): Promise<AdjustmentResult> {
  const pool = await lockPool(tx, input.spaceId, input.poolId);
  let delta = toMilli(input.delta);
  let shortfall = BigInt(0);
  const remaining = toMilli(pool.remainingQuantity);
  if (delta < BigInt(0) && remaining + delta < BigInt(0)) {
    if (!input.clampToAvailable) throw new InsufficientStockError(pool.remainingQuantity);
    shortfall = -(remaining + delta);
    delta = -remaining;
  }
  if (delta === BigInt(0)) {
    return { adjustmentId: null, delta: "0", balanceAfter: fromMilli(remaining), shortfall: fromMilli(shortfall), lowStock: "unchanged", webhookDeliveryIds: [] };
  }
  const balanceAfter = nextBalance(pool.remainingQuantity, fromMilli(delta));
  const transition = input.silent ? "none" : lowStockTransition({ before: pool.remainingQuantity, after: balanceAfter, lowThreshold: pool.lowThreshold, alerted: pool.lowAlertedAt !== null });
  await tx.consumablePool.update({
    where: { spaceId_id: { spaceId: input.spaceId, id: pool.id } },
    data: {
      remainingQuantity: balanceAfter,
      ...(transition === "alert" ? { lowAlertedAt: new Date() } : transition === "clear" ? { lowAlertedAt: null } : {}),
    },
  });
  const adjustment = await tx.consumableAdjustment.create({
    data: {
      spaceId: input.spaceId,
      poolId: pool.id,
      kind: input.kind,
      delta: fromMilli(delta),
      balanceAfter,
      reason: (input.reason ?? "").slice(0, 500),
      actorId: input.actorId ?? null,
      jobId: input.jobId ?? null,
      usageLogId: input.usageLogId ?? null,
    },
    select: { id: true },
  });
  const webhookDeliveryIds = transition === "alert" ? await queueLowStockAlert(tx, { ...pool, remainingQuantity: balanceAfter }) : [];
  return {
    adjustmentId: adjustment.id,
    delta: fromMilli(delta),
    balanceAfter,
    shortfall: fromMilli(shortfall),
    lowStock: transition === "alert" ? "alerted" : transition === "clear" ? "cleared" : "unchanged",
    webhookDeliveryIds,
  };
}
