import "server-only";

import type { MeteringUnit, PayoutMethod, Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { applyAdjustment, lockPool, PoolNotFoundError } from "./ledger";
import { fromMilli, toMilli } from "./math";
import { postFinance } from "@/lib/finance/post";

export class PoolBindingError extends Error {}

export type PoolBinding = { kind: "machine"; machineId: string } | { kind: "type"; typeId: string } | { kind: "shared" };

export type PoolDetails = {
  material: string;
  colour: string;
  colourHex: string;
  brand: string;
  lotCode: string;
  lowThreshold: string | null;
  costPerUnit: number | null;
  isPublic: boolean;
};

/**
 * Resolve a binding inside the space. A pool bound to a machine or type whose type counts consumables must use
 * that unit, so grams never land on a sheet-fed machine.
 */
async function resolveBinding(tx: Prisma.TransactionClient, spaceId: string, binding: PoolBinding, unit: MeteringUnit) {
  if (binding.kind === "shared") return { machineId: null, typeId: null };
  if (binding.kind === "machine") {
    const machine = await tx.machine.findFirst({ where: { id: binding.machineId, spaceId, retiredAt: null }, select: { id: true, type: { select: { consumableUnit: true } } } });
    if (!machine) throw new PoolBindingError("Machine not found.");
    if (machine.type.consumableUnit && machine.type.consumableUnit !== unit) throw new PoolBindingError("This machine counts its consumables in a different unit.");
    return { machineId: machine.id, typeId: null };
  }
  const type = await tx.machineType.findFirst({ where: { id: binding.typeId, spaceId }, select: { id: true, consumableUnit: true } });
  if (!type) throw new PoolBindingError("Machine type not found.");
  if (type.consumableUnit && type.consumableUnit !== unit) throw new PoolBindingError("This machine type counts its consumables in a different unit.");
  return { machineId: null, typeId: type.id };
}

/** A new pool. The opening stock goes through the ledger, so the balance is always the sum of its rows. */
export async function createPool(tx: Prisma.TransactionClient, input: PoolDetails & { spaceId: string; actorId: string; unit: MeteringUnit; initialQuantity: string; binding: PoolBinding }) {
  const scope = await resolveBinding(tx, input.spaceId, input.binding, input.unit);
  const pool = await tx.consumablePool.create({
    data: {
      spaceId: input.spaceId,
      ...scope,
      material: input.material,
      colour: input.colour,
      colourHex: input.colourHex,
      brand: input.brand,
      lotCode: input.lotCode,
      unit: input.unit,
      initialQuantity: input.initialQuantity,
      remainingQuantity: "0",
      lowThreshold: input.lowThreshold,
      costPerUnit: input.costPerUnit,
      isPublic: input.isPublic,
      openedAt: new Date(),
      createdById: input.actorId,
    },
    select: { id: true },
  });
  const opening = toMilli(input.initialQuantity) > BigInt(0)
    ? await applyAdjustment(tx, { spaceId: input.spaceId, poolId: pool.id, kind: "RESTOCK", delta: input.initialQuantity, reason: "Opening stock", actorId: input.actorId })
    : null;
  await recordAuditEvent({ action: "consumable.created", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "ConsumablePool", targetId: pool.id, metadata: { unit: input.unit, binding: input.binding.kind }, client: tx });
  return { poolId: pool.id, webhookDeliveryIds: opening?.webhookDeliveryIds ?? [] };
}

/** Edit what a pool is (never its quantities, unit or binding; those go through the ledger or a new pool). */
export async function updatePool(tx: Prisma.TransactionClient, input: PoolDetails & { spaceId: string; poolId: string; actorId: string }) {
  const pool = await lockPool(tx, input.spaceId, input.poolId);
  const stillLow = input.lowThreshold !== null && toMilli(pool.remainingQuantity) <= toMilli(input.lowThreshold);
  await tx.consumablePool.update({
    where: { spaceId_id: { spaceId: input.spaceId, id: pool.id } },
    data: {
      material: input.material, colour: input.colour, colourHex: input.colourHex, brand: input.brand, lotCode: input.lotCode,
      lowThreshold: input.lowThreshold, costPerUnit: input.costPerUnit, isPublic: input.isPublic,
      // A threshold moved below the current stock ends the low state, so the next crossing alerts again.
      ...(!stillLow && pool.lowAlertedAt ? { lowAlertedAt: null } : {}),
    },
  });
  await recordAuditEvent({ action: "consumable.updated", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "ConsumablePool", targetId: pool.id, client: tx });
}

/** A restock that was bought (not donated) carries what was spent; it posts to the finance ledger. */
export type RestockPurchase = { amountMinor: number; method: PayoutMethod; reference?: string; supplier?: string };

export async function restockPool(tx: Prisma.TransactionClient, input: { spaceId: string; poolId: string; actorId: string; quantity: string; reason?: string; lotCode?: string; purchase?: RestockPurchase }) {
  const result = await applyAdjustment(tx, { spaceId: input.spaceId, poolId: input.poolId, kind: "RESTOCK", delta: input.quantity, reason: input.reason ?? "", actorId: input.actorId });
  const pool = await tx.consumablePool.findUniqueOrThrow({ where: { spaceId_id: { spaceId: input.spaceId, id: input.poolId } }, select: { initialQuantity: true } });
  // The remaining bar measures against the fullest the pool has been.
  const capacity = toMilli(pool.initialQuantity.toString()) < toMilli(result.balanceAfter) ? result.balanceAfter : undefined;
  if (capacity || input.lotCode) {
    await tx.consumablePool.update({ where: { spaceId_id: { spaceId: input.spaceId, id: input.poolId } }, data: { ...(capacity ? { initialQuantity: capacity } : {}), ...(input.lotCode ? { lotCode: input.lotCode } : {}) } });
  }
  await recordAuditEvent({ action: "consumable.restocked", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "ConsumablePool", targetId: input.poolId, metadata: { quantity: result.delta }, client: tx });
  if (input.purchase && result.adjustmentId) {
    const { currency } = await tx.space.findUniqueOrThrow({ where: { id: input.spaceId }, select: { currency: true } });
    const bound = await tx.consumablePool.findUniqueOrThrow({ where: { spaceId_id: { spaceId: input.spaceId, id: input.poolId } }, select: { machineId: true, typeId: true, material: true } });
    const posted = await postFinance(tx, { spaceId: input.spaceId, direction: "OUT", category: "CONSUMABLES", amountMinor: input.purchase.amountMinor, currency,
      method: input.purchase.method, reference: input.purchase.reference, supplier: input.purchase.supplier, occurredAt: new Date(), sourceType: "ConsumableAdjustment",
      sourceId: result.adjustmentId, actorId: input.actorId, note: `Restock: ${bound.material}`, machineId: bound.machineId, typeId: bound.typeId });
    return { ...result, webhookDeliveryIds: [...result.webhookDeliveryIds, ...posted.webhookDeliveryIds] };
  }
  return result;
}

/** A signed correction after a count or a spill. The reason is required and kept on the ledger row. */
export async function correctPool(tx: Prisma.TransactionClient, input: { spaceId: string; poolId: string; actorId: string; delta: string; reason: string }) {
  const result = await applyAdjustment(tx, { spaceId: input.spaceId, poolId: input.poolId, kind: "CORRECTION", delta: input.delta, reason: input.reason, actorId: input.actorId });
  await recordAuditEvent({ action: "consumable.corrected", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "ConsumablePool", targetId: input.poolId, metadata: { delta: result.delta }, client: tx });
  return result;
}

/** Take a pool out of use: whatever is left leaves through one RETIRE row and the pool stops serving machines. */
export async function retirePool(tx: Prisma.TransactionClient, input: { spaceId: string; poolId: string; actorId: string; reason: string }) {
  const pool = await lockPool(tx, input.spaceId, input.poolId);
  if (!pool.isActive) throw new PoolNotFoundError();
  const remaining = toMilli(pool.remainingQuantity);
  if (remaining > BigInt(0)) await applyAdjustment(tx, { spaceId: input.spaceId, poolId: pool.id, kind: "RETIRE", delta: fromMilli(-remaining), reason: input.reason, actorId: input.actorId, silent: true });
  await tx.consumablePool.update({ where: { spaceId_id: { spaceId: input.spaceId, id: pool.id } }, data: { isActive: false, lowAlertedAt: null } });
  await recordAuditEvent({ action: "consumable.retired", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "ConsumablePool", targetId: pool.id, client: tx });
}

export async function setPoolPublic(tx: Prisma.TransactionClient, input: { spaceId: string; poolId: string; actorId: string; isPublic: boolean }) {
  const updated = await tx.consumablePool.updateMany({ where: { id: input.poolId, spaceId: input.spaceId }, data: { isPublic: input.isPublic } });
  if (updated.count !== 1) throw new PoolNotFoundError();
  await recordAuditEvent({ action: "consumable.visibility_changed", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "ConsumablePool", targetId: input.poolId, metadata: { isPublic: input.isPublic }, client: tx });
}
