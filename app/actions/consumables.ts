"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { invalid, refreshMachinePages, slugOf, staffAction, type Failure } from "@/lib/actionAccess";
import { InsufficientStockError, formatQuantity } from "@/lib/consumables/math";
import { PoolNotFoundError } from "@/lib/consumables/ledger";
import { correctPool, createPool, PoolBindingError, restockPool, retirePool, setPoolPublic, updatePool, type PoolDetails, type RestockPurchase } from "@/lib/consumables/pools";
import { can } from "@/lib/permissionRoles";
import type { SpaceRole } from "@prisma/client";
import { correctionSchema, createPoolSchema, poolDetailsSchema, restockSchema, retirePoolSchema } from "@/lib/machines/schemas";
import { isCurrencyCode, parseAmount } from "@/lib/money/currencies";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import type { ActionResult } from "./space";

/** Consumable pools: machine managers and operators (consumables.manage). Every change goes through the ledger. */

const poolId = z.string().trim().min(1).max(64);

function failure(error: unknown): Failure {
  if (error instanceof PoolNotFoundError) return { ok: false, error: "Pool not found." };
  if (error instanceof PoolBindingError) return { ok: false, error: error.message, fieldErrors: { binding: [error.message] } };
  if (error instanceof InsufficientStockError) return { ok: false, error: `The pool only holds ${formatQuantity(error.available)}. A pool can't go below zero.` };
  throw error;
}

async function details(spaceId: string, values: z.infer<typeof poolDetailsSchema>): Promise<PoolDetails | Failure> {
  let costPerUnit: number | null = null;
  if (values.costPerUnit) {
    const space = await prisma.space.findUniqueOrThrow({ where: { id: spaceId }, select: { currency: true } });
    costPerUnit = isCurrencyCode(space.currency) ? parseAmount(values.costPerUnit, space.currency) : null;
    if (costPerUnit === null) return { ok: false, error: "Check the highlighted fields.", fieldErrors: { costPerUnit: ["Enter an amount like 2.50"] } };
  }
  return { ...values, costPerUnit };
}

export async function createPoolAction(input: unknown): Promise<ActionResult<{ poolId: string }>> {
  const access = await staffAction(slugOf(input), "consumables.manage");
  if (!access.ok) return access;
  const parsed = createPoolSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const clean = await details(access.space.id, parsed.data);
  if ("ok" in clean) return clean;
  try {
    const result = await prisma.$transaction((tx) => createPool(tx, { ...clean, spaceId: access.space.id, actorId: access.userId, unit: parsed.data.unit, initialQuantity: parsed.data.initialQuantity, binding: parsed.data.binding }));
    await enqueueWebhookDeliveries(result.webhookDeliveryIds);
    refreshMachinePages(access.space.slug);
    return { ok: true, data: { poolId: result.poolId } };
  } catch (error) {
    return failure(error);
  }
}

export async function updatePoolAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "consumables.manage");
  if (!access.ok) return access;
  const parsed = poolDetailsSchema.extend({ poolId }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const clean = await details(access.space.id, parsed.data);
  if ("ok" in clean) return clean;
  try {
    await prisma.$transaction((tx) => updatePool(tx, { ...clean, spaceId: access.space.id, poolId: parsed.data.poolId, actorId: access.userId }));
  } catch (error) {
    return failure(error);
  }
  refreshMachinePages(access.space.slug);
  return { ok: true };
}

/** Restock, correction and retirement all write one ledger row each (append-only, with the balance after). */
async function ledgerAction<T extends z.ZodType>(input: unknown, schema: T, work: (spaceId: string, actorId: string, data: z.infer<T> & { poolId: string }, role: SpaceRole) => Promise<{ webhookDeliveryIds?: string[] } | void>): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "consumables.manage");
  if (!access.ok) return access;
  const parsed = z.object({ poolId }).and(schema).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const result = await work(access.space.id, access.userId, parsed.data as z.infer<T> & { poolId: string }, access.membership.role);
    await enqueueWebhookDeliveries(result?.webhookDeliveryIds ?? []);
  } catch (error) {
    return failure(error);
  }
  refreshMachinePages(access.space.slug);
  return { ok: true };
}

/** A restock; with an amount (the machine manager only, as it is money) it is also a consumable purchase in Finance. */
export async function restockPoolAction(input: unknown): Promise<ActionResult> {
  return ledgerAction(input, restockSchema, async (spaceId, actorId, data, role) => {
    let purchase: RestockPurchase | undefined;
    if (data.amount && can(role, "finance.view")) {
      const { currency } = await prisma.space.findUniqueOrThrow({ where: { id: spaceId }, select: { currency: true } });
      const amountMinor = isCurrencyCode(currency) ? parseAmount(data.amount, currency) : null;
      if (!amountMinor) throw new PoolBindingError("Enter what the restock cost, like 1500 or 1,500.50.");
      purchase = { amountMinor, method: data.method, reference: data.reference, supplier: data.supplier };
    }
    return prisma.$transaction((tx) => restockPool(tx, { spaceId, actorId, poolId: data.poolId, quantity: data.quantity, reason: data.reason, lotCode: data.lotCode, purchase }));
  });
}

export async function correctPoolAction(input: unknown): Promise<ActionResult> {
  return ledgerAction(input, correctionSchema, (spaceId, actorId, data) =>
    prisma.$transaction((tx) => correctPool(tx, { spaceId, actorId, poolId: data.poolId, delta: data.delta, reason: data.reason })));
}

export async function retirePoolAction(input: unknown): Promise<ActionResult> {
  return ledgerAction(input, retirePoolSchema, (spaceId, actorId, data) =>
    prisma.$transaction((tx) => retirePool(tx, { spaceId, actorId, poolId: data.poolId, reason: data.reason })));
}

export async function setPoolPublicAction(input: unknown): Promise<ActionResult> {
  return ledgerAction(input, z.object({ isPublic: z.boolean() }), (spaceId, actorId, data) =>
    prisma.$transaction((tx) => setPoolPublic(tx, { spaceId, actorId, poolId: data.poolId, isPublic: data.isPublic })));
}
