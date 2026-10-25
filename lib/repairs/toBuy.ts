import "server-only";
import type { PayoutMethod, Prisma, ToBuyKind, ToBuyStatus } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { restockPool } from "@/lib/consumables/pools";
import { machineRefs, postFinance } from "@/lib/finance/post";
import { actorMayUseMachine, scopeForActor } from "@/lib/typeScope";

/**
 * The to-buy list (owner decision 2026-10-24): parts and consumables staff ask for, from a fault, a maintenance
 * record or a low pool. requested -> approved -> bought -> received. Buying records what was actually spent
 * (amount, method, reference, supplier) and posts it to the finance ledger; receiving a consumable restocks its
 * pool through lib/consumables.
 */
export class ToBuyError extends Error {}
export class ToBuyNotFoundError extends Error {
  constructor() { super("Space not found."); }
}

const NEXT: Record<ToBuyStatus, ToBuyStatus[]> = { REQUESTED: ["APPROVED", "CANCELLED"], APPROVED: ["BOUGHT", "CANCELLED"], BOUGHT: ["RECEIVED"], RECEIVED: [], CANCELLED: [] };
const QUANTITY = /^\d{1,10}(?:\.\d{1,3})?$/;

export async function requestToBuy(tx: Prisma.TransactionClient, actor: { spaceId: string; actorId: string }, input: {
  kind: ToBuyKind; title: string; quantity: string; unit?: string; machineId?: string | null; poolId?: string | null; faultId?: string | null;
  maintenanceLogId?: string | null; note?: string;
}) {
  const title = input.title.trim().slice(0, 160);
  if (title.length < 2) throw new ToBuyError("Say what to buy.");
  if (!QUANTITY.test(input.quantity) || Number(input.quantity) <= 0) throw new ToBuyError("Enter a quantity above zero.");
  let machineId = input.machineId ?? null;
  if (input.faultId) {
    const fault = await tx.faultReport.findFirst({ where: { spaceId: actor.spaceId, id: input.faultId }, select: { machineId: true } });
    if (!fault) throw new ToBuyNotFoundError();
    machineId ??= fault.machineId;
  }
  if (input.maintenanceLogId) {
    const log = await tx.maintenanceLog.findFirst({ where: { spaceId: actor.spaceId, id: input.maintenanceLogId }, select: { machineId: true } });
    if (!log) throw new ToBuyNotFoundError();
    machineId ??= log.machineId;
  }
  const pool = input.poolId ? await tx.consumablePool.findFirst({ where: { spaceId: actor.spaceId, id: input.poolId }, select: { id: true, machineId: true, typeId: true, unit: true } }) : null;
  if (input.poolId && !pool) throw new ToBuyNotFoundError();
  if (input.kind === "CONSUMABLE" && !pool) throw new ToBuyError("Pick the consumable pool this restocks.");
  // A machine type manager asks only for their own machines (or pools tied to their types).
  const scope = await scopeForActor(tx, actor.spaceId, actor.actorId);
  if (scope !== null) {
    const machineOk = machineId ? await actorMayUseMachine(tx, actor.spaceId, actor.actorId, machineId) : false;
    const poolOk = pool ? (pool.typeId ? scope.includes(pool.typeId) : pool.machineId ? await actorMayUseMachine(tx, actor.spaceId, actor.actorId, pool.machineId) : false) : false;
    if (!machineOk && !poolOk) throw new ToBuyNotFoundError();
  }
  if (machineId && !(await tx.machine.findFirst({ where: { spaceId: actor.spaceId, id: machineId }, select: { id: true } }))) throw new ToBuyNotFoundError();
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tobuy:${actor.spaceId}`}, 0))::text`;
  const last = await tx.toBuyItem.findFirst({ where: { spaceId: actor.spaceId }, orderBy: { number: "desc" }, select: { number: true } });
  const item = await tx.toBuyItem.create({ data: { spaceId: actor.spaceId, number: (last?.number ?? 0) + 1, kind: input.kind, title, quantity: input.quantity,
    unit: (input.unit ?? pool?.unit.toLowerCase() ?? "").trim().slice(0, 30), machineId, poolId: pool?.id ?? null, faultId: input.faultId ?? null,
    maintenanceLogId: input.maintenanceLogId ?? null, note: (input.note ?? "").trim().slice(0, 1000), requestedById: actor.actorId } });
  await recordAuditEvent({ action: "tobuy.requested", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "ToBuyItem", targetId: item.id, metadata: { kind: item.kind }, client: tx });
  return item;
}

export type ToBuyStep =
  | { status: "APPROVED" | "CANCELLED" | "RECEIVED" }
  | { status: "BOUGHT"; amount: number; method: PayoutMethod; reference?: string; supplier: string; boughtAt?: Date };

/** Move an item on. Only the machine manager does this (tobuy.manage), since buying records money. */
export async function advanceToBuy(tx: Prisma.TransactionClient, actor: { spaceId: string; actorId: string }, itemId: string, step: ToBuyStep) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ToBuyItem" WHERE "spaceId" = ${actor.spaceId} AND "id" = ${itemId} FOR UPDATE`;
  if (!rows[0]) throw new ToBuyNotFoundError();
  const item = await tx.toBuyItem.findUniqueOrThrow({ where: { id: itemId } });
  if (!NEXT[item.status].includes(step.status)) throw new ToBuyError(`A ${item.status.toLowerCase()} item can't be marked ${step.status.toLowerCase()}.`);
  const now = new Date();
  const ids: string[] = [];
  if (step.status === "BOUGHT") {
    const reference = (step.reference ?? "").trim().slice(0, 200), supplier = step.supplier.trim().slice(0, 200);
    if (!Number.isInteger(step.amount) || step.amount <= 0) throw new ToBuyError("Enter what was actually spent.");
    if (supplier.length < 2) throw new ToBuyError("Name the supplier.");
    if (step.method !== "CASH" && reference.length < 2) throw new ToBuyError("Add the payment reference (cash needs none).");
    const boughtAt = step.boughtAt ?? now;
    if (boughtAt.getTime() > now.getTime() + 60_000) throw new ToBuyError("The date can't be in the future.");
    const { currency } = await tx.space.findUniqueOrThrow({ where: { id: actor.spaceId }, select: { currency: true } });
    await tx.toBuyItem.update({ where: { id: item.id }, data: { status: "BOUGHT", amount: step.amount, currency, method: step.method, reference, supplier, boughtAt, boughtById: actor.actorId } });
    const posted = await postFinance(tx, { spaceId: actor.spaceId, direction: "OUT", category: item.kind === "CONSUMABLE" ? "CONSUMABLES" : "PARTS", amountMinor: step.amount,
      currency, method: step.method, reference, supplier, occurredAt: boughtAt, sourceType: "ToBuyItem", sourceId: item.id, actorId: actor.actorId,
      note: `TB-${item.number} ${item.title}`, ...(await machineRefs(tx, actor.spaceId, item.machineId)) });
    ids.push(...posted.webhookDeliveryIds);
  } else {
    await tx.toBuyItem.update({ where: { id: item.id }, data: { status: step.status,
      ...(step.status === "APPROVED" ? { approvedById: actor.actorId } : step.status === "RECEIVED" ? { receivedById: actor.actorId, receivedAt: now } : {}) } });
    if (step.status === "RECEIVED" && item.kind === "CONSUMABLE" && item.poolId) {
      await restockPool(tx, { spaceId: actor.spaceId, poolId: item.poolId, actorId: actor.actorId, quantity: item.quantity.toString(), reason: `To-buy TB-${item.number}` });
    }
  }
  await recordAuditEvent({ action: `tobuy.${step.status.toLowerCase()}`, actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "ToBuyItem", targetId: item.id, client: tx });
  return { webhookDeliveryIds: ids };
}
