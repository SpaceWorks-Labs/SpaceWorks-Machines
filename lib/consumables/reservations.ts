import "server-only";

import type { Prisma } from "@prisma/client";
import { applyAdjustment, lockPool, PoolNotFoundError, type AdjustmentResult } from "./ledger";
import { fromMilli, poolServesMachine, toMilli, type Quantity } from "./math";

/**
 * Stock held for jobs (Phase 3 calls these from lib/jobs/transitions.ts, inside the transaction that row-locks
 * the job, then the machine; the pool is locked here, last). Quantities are in the pool's unit.
 */

export class PoolUnavailableError extends Error {}

/**
 * At job start: take `quantity` out of the pool for the job. The pool must be active, serve the machine (bound
 * to it, to its type, or shared) and hold enough; otherwise this throws and the transition rolls back.
 */
export async function reserve(tx: Prisma.TransactionClient, input: { spaceId: string; poolId: string; jobId: string; quantity: Quantity; actorId?: string | null; machine?: { id: string; typeId: string } }): Promise<AdjustmentResult> {
  if (toMilli(input.quantity) <= BigInt(0)) throw new PoolUnavailableError("Reserve a quantity above zero.");
  const pool = await lockPool(tx, input.spaceId, input.poolId);
  if (!pool.isActive) throw new PoolUnavailableError("This pool is retired.");
  if (input.machine && !poolServesMachine(pool, input.machine)) throw new PoolUnavailableError("This pool doesn't serve that machine.");
  return applyAdjustment(tx, { spaceId: input.spaceId, poolId: pool.id, kind: "RESERVE", delta: fromMilli(-toMilli(input.quantity)), jobId: input.jobId, actorId: input.actorId, reason: "Reserved for a job" });
}

/**
 * At completion or failure: settle the reservation against what was really used. Unused stock goes back; extra
 * use is taken, but never more than the pool holds (the shortfall is reported, never a negative balance).
 */
export async function reconcile(tx: Prisma.TransactionClient, input: { spaceId: string; poolId: string; jobId: string; reserved: Quantity; actual: Quantity; actorId?: string | null }): Promise<AdjustmentResult> {
  const reserved = toMilli(input.reserved);
  const actual = toMilli(input.actual);
  if (reserved < BigInt(0) || actual < BigInt(0)) throw new PoolUnavailableError("Quantities can't be negative.");
  return applyAdjustment(tx, {
    spaceId: input.spaceId, poolId: input.poolId, kind: "RECONCILE", delta: fromMilli(reserved - actual),
    jobId: input.jobId, actorId: input.actorId, clampToAvailable: true, reason: "Settled against actual use",
  });
}

/** On cancel (or a reservation that was never used): give the whole reservation back. */
export async function release(tx: Prisma.TransactionClient, input: { spaceId: string; poolId: string; jobId: string; reserved: Quantity; actorId?: string | null }): Promise<AdjustmentResult> {
  const reserved = toMilli(input.reserved);
  if (reserved < BigInt(0)) throw new PoolUnavailableError("Quantities can't be negative.");
  return applyAdjustment(tx, { spaceId: input.spaceId, poolId: input.poolId, kind: "RELEASE", delta: fromMilli(reserved), jobId: input.jobId, actorId: input.actorId, reason: "Reservation released" });
}

export { PoolNotFoundError };
