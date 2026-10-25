import "server-only";
import type { FinanceCategory, FinanceDirection, FinanceEntry, FinanceMethod, PaymentMethod, Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { emitWebhook } from "@/lib/webhooks/emit";

/**
 * The finance ledger (owner decision 2026-10-24): every money movement posts one append-only FinanceEntry in
 * the same transaction as its source. A source posts once ([sourceType, sourceId] is unique), so retries and
 * replays are no-ops; corrections are reversing entries. Amounts are minor units and never mix currencies.
 */
export class FinanceError extends Error {}

export type FinanceSource = "Payment" | "Refund" | "RepairPayout" | "MaintenanceLog" | "ToBuyItem" | "ConsumableAdjustment" | "Manual" | "Reversal";

export type Posting = {
  spaceId: string; direction: FinanceDirection; category: FinanceCategory; amountMinor: number; currency: string; method: FinanceMethod;
  occurredAt: Date; sourceType: FinanceSource; sourceId: string; actorId?: string | null; reference?: string; note?: string;
  machineId?: string | null; typeId?: string | null; technicianId?: string | null; supplier?: string; reversesId?: string | null;
};

/** Gateway and desk payment methods as ledger methods (a card terminal is "other" with its reference). */
export function financeMethodOf(method: PaymentMethod | null | undefined): FinanceMethod {
  if (method === "RAZORPAY") return "GATEWAY_RAZORPAY";
  if (method === "STRIPE") return "GATEWAY_STRIPE";
  if (method === "CASH" || method === "BANK_TRANSFER" || method === "UPI") return method;
  return "OTHER";
}

/** Machine and type for a machine id, so spend can be reported per machine and scoped per type. */
export async function machineRefs(tx: Prisma.TransactionClient, spaceId: string, machineId: string | null | undefined) {
  if (!machineId) return { machineId: null, typeId: null };
  const machine = await tx.machine.findFirst({ where: { spaceId, id: machineId }, select: { id: true, typeId: true } });
  return { machineId: machine?.id ?? null, typeId: machine?.typeId ?? null };
}

/**
 * Post one entry and announce it (`finance.entry_posted`: ids, amount and category only). Zero amounts post
 * nothing. Returns the entry (an existing one when this source already posted) and webhook delivery ids.
 */
export async function postFinance(tx: Prisma.TransactionClient, posting: Posting): Promise<{ entry: FinanceEntry | null; webhookDeliveryIds: string[] }> {
  if (!Number.isInteger(posting.amountMinor) || posting.amountMinor < 0) throw new FinanceError("Amounts are whole minor units of zero or more.");
  if (posting.amountMinor === 0) return { entry: null, webhookDeliveryIds: [] };
  if (!/^[A-Z]{3}$/.test(posting.currency)) throw new FinanceError("Every entry needs its ISO currency.");
  const existing = await tx.financeEntry.findUnique({ where: { sourceType_sourceId: { sourceType: posting.sourceType, sourceId: posting.sourceId } } });
  if (existing) return { entry: existing, webhookDeliveryIds: [] };
  const entry = await tx.financeEntry.create({ data: {
    spaceId: posting.spaceId, direction: posting.direction, category: posting.category, amountMinor: posting.amountMinor, currency: posting.currency,
    method: posting.method, occurredAt: posting.occurredAt, sourceType: posting.sourceType, sourceId: posting.sourceId, actorId: posting.actorId ?? null,
    reference: (posting.reference ?? "").slice(0, 200), note: (posting.note ?? "").slice(0, 500), machineId: posting.machineId ?? null, typeId: posting.typeId ?? null,
    technicianId: posting.technicianId ?? null, supplier: (posting.supplier ?? "").slice(0, 200), reversesId: posting.reversesId ?? null,
  } });
  const webhookDeliveryIds = await emitWebhook(tx, posting.spaceId, "finance.entry_posted", {
    entryId: entry.id, direction: entry.direction, category: entry.category, amountMinor: entry.amountMinor, currency: entry.currency,
    sourceType: entry.sourceType, sourceId: entry.sourceId, ...(entry.machineId ? { machineId: entry.machineId } : {}),
  });
  return { entry, webhookDeliveryIds };
}

/** Undo an entry with an equal and opposite one; an entry is reversed at most once and reversals never are. */
export async function reverseFinanceEntry(tx: Prisma.TransactionClient, actor: { spaceId: string; actorId: string }, entryId: string, reason: string) {
  const note = reason.trim();
  if (note.length < 3) throw new FinanceError("Say why this entry is reversed.");
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`finance:${entryId}`}, 0))::text`;
  const original = await tx.financeEntry.findFirst({ where: { spaceId: actor.spaceId, id: entryId } });
  if (!original) throw new FinanceError("Entry not found.");
  if (original.category === "REVERSAL") throw new FinanceError("A reversal can't itself be reversed.");
  if (await tx.financeEntry.findUnique({ where: { reversesId: original.id } })) throw new FinanceError("This entry is already reversed.");
  const result = await postFinance(tx, { ...original, direction: original.direction === "IN" ? "OUT" : "IN", category: "REVERSAL", occurredAt: new Date(),
    sourceType: "Reversal", sourceId: original.id, actorId: actor.actorId, note, reversesId: original.id });
  await recordAuditEvent({ action: "finance.reversed", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "FinanceEntry", targetId: original.id, client: tx });
  return result;
}

export const MANUAL_CATEGORIES = ["OTHER_INCOME", "OTHER_EXPENSE", "PARTS", "CONSUMABLES", "MAINTENANCE"] as const;

/** Other income or spending (rent, utilities, a donation) entered by the machine manager, audited. */
export async function postManualEntry(tx: Prisma.TransactionClient, actor: { spaceId: string; actorId: string }, input: {
  category: (typeof MANUAL_CATEGORIES)[number]; amountMinor: number; method: FinanceMethod; reference?: string; note: string; occurredAt: Date;
  supplier?: string; machineId?: string | null;
}) {
  const space = await tx.space.findUniqueOrThrow({ where: { id: actor.spaceId }, select: { currency: true } });
  if (input.amountMinor <= 0) throw new FinanceError("Enter an amount above zero.");
  if (input.occurredAt.getTime() > Date.now() + 60_000) throw new FinanceError("The date can't be in the future.");
  const refs = await machineRefs(tx, actor.spaceId, input.machineId);
  if (input.machineId && !refs.machineId) throw new FinanceError("Machine not found.");
  const sourceId = crypto.randomUUID();
  const result = await postFinance(tx, { spaceId: actor.spaceId, direction: input.category === "OTHER_INCOME" ? "IN" : "OUT", category: input.category,
    amountMinor: input.amountMinor, currency: space.currency, method: input.method, occurredAt: input.occurredAt, sourceType: "Manual", sourceId,
    actorId: actor.actorId, reference: input.reference, note: input.note, supplier: input.supplier, ...refs });
  await recordAuditEvent({ action: "finance.manual_entry", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "FinanceEntry", targetId: result.entry!.id,
    metadata: { category: input.category }, client: tx });
  return result;
}
