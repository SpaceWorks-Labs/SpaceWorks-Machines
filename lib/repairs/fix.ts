import "server-only";
import type { PayoutMethod, Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { queueChatAlerts } from "@/lib/chat/notify";
import { machineRefs, postFinance } from "@/lib/finance/post";
import { logMaintenance, updateFault } from "@/lib/upkeep";
import { queueUpkeepAlert } from "@/lib/upkeep/alerts";
import { faultNumber } from "@/lib/upkeep/labels";
import { emitWebhook } from "@/lib/webhooks/emit";
import { closeRequestsForFault, lockFault, RepairError } from "./requests";

/**
 * The fix and its money (owner decision 2026-10-24): the assigned technician records remarks, parts, photos and
 * the amount they ask, and marks it fixed; a manager verifies and closes (or reopens with a reason); the machine
 * manager approves the amount and records payouts, partly or in full, each one posted to the finance ledger.
 */
const MAX_AMOUNT = 100_000_000_00;

export async function recordFix(tx: Prisma.TransactionClient, input: { spaceId: string; faultId: string; technicianId: string; actorId: string | null;
  remarks: string; parts?: string; amountAsked: number | null; fixed: boolean }) {
  const fault = await lockFault(tx, input.spaceId, input.faultId);
  if (fault.technicianId !== input.technicianId) throw new RepairError("Only the technician who took this repair can record the fix.");
  if (["RESOLVED", "WONT_FIX"].includes(fault.status)) throw new RepairError("This fault is closed.");
  if (fault.status === "FIXED" && !input.fixed) throw new RepairError("This repair is waiting for the manager to check it.");
  if (fault.approvedAmount !== null && input.amountAsked !== fault.amountAsked) throw new RepairError("The amount was already approved and can't change.");
  if (input.amountAsked !== null && (!Number.isInteger(input.amountAsked) || input.amountAsked < 0 || input.amountAsked > MAX_AMOUNT)) throw new RepairError("Enter the amount you ask as zero or more.");
  const remarks = input.remarks.trim().slice(0, 4000);
  if (input.fixed && remarks.length < 3) throw new RepairError("Say what you fixed.");
  const updated = await tx.faultReport.update({ where: { id: fault.id }, data: { fixRemarks: remarks, fixParts: (input.parts ?? "").trim().slice(0, 2000),
    amountAsked: input.amountAsked, ...(input.fixed ? { status: "FIXED", fixedAt: new Date() } : fault.status === "ACKNOWLEDGED" || fault.status === "OPEN" ? { status: "IN_PROGRESS" } : {}) } });
  await recordAuditEvent({ action: input.fixed ? "repair.fixed" : "repair.updated", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "FaultReport", targetId: fault.id, client: tx });
  if (input.fixed) await queueUpkeepAlert(tx, input.spaceId, fault.machineId, "fault-fixed", fault.id);
  return updated;
}

/** Check the fix: close it (a corrective maintenance record is written, downtime ends) or reopen it with a reason. */
export async function verifyRepair(tx: Prisma.TransactionClient, actor: { spaceId: string; actorId: string }, input: { faultId: string; approve: boolean; reason?: string }) {
  const fault = await lockFault(tx, actor.spaceId, input.faultId, actor.actorId);
  if (fault.status !== "FIXED") throw new RepairError("Only a repair marked fixed can be checked.");
  if (!input.approve) {
    const reason = (input.reason ?? "").trim().slice(0, 1000);
    if (reason.length < 3) throw new RepairError("Say why the repair is reopened.");
    await tx.faultReport.update({ where: { id: fault.id }, data: { status: "IN_PROGRESS", reopenReason: reason, fixedAt: null } });
    await recordAuditEvent({ action: "repair.reopened", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "FaultReport", targetId: fault.id, client: tx });
    return { webhookDeliveryIds: [] };
  }
  const log = await logMaintenance(tx, actor, { machineId: fault.machineId, faultId: fault.id, kind: "CORRECTIVE", summary: `Repair of ${faultNumber(fault.number)}: ${fault.title}`.slice(0, 120),
    details: fault.fixRemarks, partsNote: fault.fixParts, restoreIdle: true });
  await tx.faultReport.update({ where: { id: fault.id }, data: { verifiedById: actor.actorId } });
  const closed = await updateFault(tx, actor, { faultId: fault.id, status: "RESOLVED", resolution: fault.fixRemarks || "Repaired." });
  await closeRequestsForFault(tx, actor.spaceId, fault.id);
  await queueChatAlerts(tx, actor.spaceId, "fault-resolved", { faultId: fault.id, machineId: fault.machineId });
  return { webhookDeliveryIds: [...(log.webhookDeliveryIds ?? []), ...closed.webhookDeliveryIds] };
}

export function payoutStatus(approved: number | null, paid: number) {
  if (paid <= 0) return "UNPAID" as const;
  return approved !== null && paid >= approved ? "PAID" as const : "PARTLY_PAID" as const;
}

/** The machine manager approves what the technician is paid; changing their amount needs a reason. */
export async function approveRepairAmount(tx: Prisma.TransactionClient, actor: { spaceId: string; actorId: string }, input: { faultId: string; amount: number; reason?: string }) {
  const fault = await lockFault(tx, actor.spaceId, input.faultId);
  if (!fault.technicianId) throw new RepairError("No technician took this repair.");
  if (!Number.isInteger(input.amount) || input.amount < 0 || input.amount > MAX_AMOUNT) throw new RepairError("Enter an amount of zero or more.");
  if (input.amount < fault.paidAmount) throw new RepairError("The approved amount can't be less than what was already paid.");
  const reason = (input.reason ?? "").trim().slice(0, 500);
  if (input.amount !== fault.amountAsked && reason.length < 3) throw new RepairError("Say why the amount differs from what the technician asked.");
  await tx.faultReport.update({ where: { id: fault.id }, data: { approvedAmount: input.amount, approvedById: actor.actorId, approvedAt: new Date(),
    amountChangeReason: input.amount === fault.amountAsked ? "" : reason, payoutStatus: payoutStatus(input.amount, fault.paidAmount) } });
  await recordAuditEvent({ action: "repair.amount_approved", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "FaultReport", targetId: fault.id,
    metadata: { changed: input.amount !== fault.amountAsked }, client: tx });
}

/** Pay the technician (in parts if needed) up to the approved amount: an append-only payout and a ledger entry. */
export async function recordRepairPayout(tx: Prisma.TransactionClient, actor: { spaceId: string; actorId: string }, input: {
  faultId: string; amount: number; method: PayoutMethod; reference?: string; paidAt?: Date; note?: string;
}) {
  const fault = await lockFault(tx, actor.spaceId, input.faultId);
  if (!fault.technicianId || fault.approvedAmount === null) throw new RepairError("Approve the amount before paying the technician.");
  const due = fault.approvedAmount - fault.paidAmount;
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new RepairError("Enter an amount above zero.");
  if (input.amount > due) throw new RepairError("That is more than is still due for this repair.");
  const reference = (input.reference ?? "").trim().slice(0, 200);
  if (input.method !== "CASH" && reference.length < 2) throw new RepairError("Add the payment reference (cash needs none).");
  const paidAt = input.paidAt ?? new Date();
  if (paidAt.getTime() > Date.now() + 60_000) throw new RepairError("The date can't be in the future.");
  const space = await tx.space.findUniqueOrThrow({ where: { id: actor.spaceId }, select: { currency: true } });
  const payout = await tx.repairPayout.create({ data: { spaceId: actor.spaceId, faultId: fault.id, technicianId: fault.technicianId, amount: input.amount,
    currency: space.currency, method: input.method, reference, paidAt, paidById: actor.actorId, note: (input.note ?? "").trim().slice(0, 500) } });
  const paid = fault.paidAmount + input.amount;
  await tx.faultReport.update({ where: { id: fault.id }, data: { paidAmount: paid, payoutStatus: payoutStatus(fault.approvedAmount, paid) } });
  const posted = await postFinance(tx, { spaceId: actor.spaceId, direction: "OUT", category: "REPAIR_PAYOUT", amountMinor: input.amount, currency: space.currency,
    method: input.method, reference, occurredAt: paidAt, sourceType: "RepairPayout", sourceId: payout.id, actorId: actor.actorId,
    technicianId: fault.technicianId, note: `${faultNumber(fault.number)} ${fault.title}`, ...(await machineRefs(tx, actor.spaceId, fault.machineId)) });
  await recordAuditEvent({ action: "repair.paid", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "RepairPayout", targetId: payout.id, metadata: { method: input.method }, client: tx });
  await queueChatAlerts(tx, actor.spaceId, "repair-payment", { faultId: fault.id, machineId: fault.machineId });
  const ids = await emitWebhook(tx, actor.spaceId, "repair.paid", { faultId: fault.id, payoutId: payout.id, amountMinor: payout.amount, currency: payout.currency,
    status: payoutStatus(fault.approvedAmount, paid) });
  return { payout, webhookDeliveryIds: [...ids, ...posted.webhookDeliveryIds] };
}
