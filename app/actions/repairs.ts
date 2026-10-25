"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { invalid, revalidate, slugOf, staffAction } from "@/lib/actionAccess";
import type { Capability } from "@/lib/permissionRoles";
import { approveRepairAmount, recordFix, recordRepairPayout, verifyRepair } from "@/lib/repairs/fix";
import { ANSWER_ERRORS, answerRepairRequest, assignTechnician, lockFault, RepairError, RepairNotFoundError, sendRepairRequests } from "@/lib/repairs/requests";
import { answerRequestSchema, approveAmountSchema, assignTechnicianSchema, noonOf, payoutSchema, revokeRequestSchema, sendRequestsSchema, staffFixSchema, verifySchema } from "@/lib/repairs/schemas";
import { UpkeepError, UpkeepNotFoundError } from "@/lib/upkeep";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import { FinanceError } from "@/lib/finance/post";
import type { ActionResult } from "./space";

/** Repairs: asking technicians, the fix, checking it and paying for it. Every outcome outside scope reads as not found. */
const NOT_FOUND = { ok: false as const, error: "Space not found." };

async function run(input: unknown, capability: Capability, schema: { safeParse(value: unknown): { success: true; data: unknown } | { success: false; error: import("zod").ZodError } },
  work: (tx: Prisma.TransactionClient, access: { spaceId: string; actorId: string }, data: never) => Promise<{ webhookDeliveryIds?: string[] } | unknown>): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), capability);
  if (!access.ok) return access;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const result = await prisma.$transaction((tx) => work(tx, { spaceId: access.space.id, actorId: access.userId }, parsed.data as never));
    const outcome = (result as { outcome?: keyof typeof ANSWER_ERRORS } | undefined)?.outcome;
    if (outcome && ANSWER_ERRORS[outcome]) return { ok: false, error: ANSWER_ERRORS[outcome]! };
    const ids = (result as { webhookDeliveryIds?: string[] } | undefined)?.webhookDeliveryIds;
    if (ids?.length) await enqueueWebhookDeliveries(ids);
  } catch (error) {
    if (error instanceof RepairNotFoundError || error instanceof UpkeepNotFoundError) return NOT_FOUND;
    if (error instanceof RepairError || error instanceof UpkeepError || error instanceof FinanceError) return { ok: false, error: error.message };
    throw error;
  }
  revalidate(`/dashboard/${access.space.slug}`, "layout");
  return { ok: true };
}

export async function sendRepairRequestsAction(input: unknown) {
  return run(input, "repairs.request", sendRequestsSchema, (tx, actor, data: { faultId: string; technicianIds: string[] }) => sendRepairRequests(tx, actor, data));
}

export async function assignTechnicianAction(input: unknown) {
  return run(input, "repairs.request", assignTechnicianSchema, (tx, actor, data: { faultId: string; technicianId: string }) => assignTechnician(tx, actor, data));
}

/** Withdraw a request still waiting for an answer; its link stops working. */
export async function revokeRepairRequestAction(input: unknown) {
  return run(input, "repairs.request", revokeRequestSchema, async (tx, actor, data: { requestId: string }) => {
    const request = await tx.repairRequest.findFirst({ where: { spaceId: actor.spaceId, id: data.requestId } });
    if (!request) throw new RepairNotFoundError();
    await lockFault(tx, actor.spaceId, request.faultId, actor.actorId);
    if (request.status !== "SENT") throw new RepairError("Only a request waiting for an answer can be withdrawn.");
    await tx.repairRequest.update({ where: { id: request.id }, data: { status: "CLOSED", closedReason: "Withdrawn." } });
  });
}

/** A staff technician answers a request in their inbox. */
export async function answerRepairRequestAction(input: unknown) {
  return run(input, "maintenance.manage", answerRequestSchema, async (tx, actor, data: { requestId: string; accept: boolean }) => {
    const technician = await tx.technician.findFirst({ where: { spaceId: actor.spaceId, userId: actor.actorId, isActive: true } });
    if (!technician) throw new RepairNotFoundError();
    return answerRepairRequest(tx, { spaceId: actor.spaceId, requestId: data.requestId, technicianId: technician.id, accept: data.accept, actorId: actor.actorId });
  });
}

/** The staff technician who took the repair records the fix. */
export async function recordStaffFixAction(input: unknown) {
  return run(input, "maintenance.manage", staffFixSchema, async (tx, actor, data: { faultId: string; remarks: string; parts: string; amountAsked: number | null; fixed: boolean }) => {
    const technician = await tx.technician.findFirst({ where: { spaceId: actor.spaceId, userId: actor.actorId } });
    if (!technician) throw new RepairNotFoundError();
    return recordFix(tx, { spaceId: actor.spaceId, faultId: data.faultId, technicianId: technician.id, actorId: actor.actorId,
      remarks: data.remarks, parts: data.parts, amountAsked: data.amountAsked, fixed: data.fixed });
  });
}

export async function verifyRepairAction(input: unknown) {
  return run(input, "repairs.verify", verifySchema, (tx, actor, data: { faultId: string; approve: boolean; reason?: string }) => verifyRepair(tx, actor, data));
}

export async function approveRepairAmountAction(input: unknown) {
  return run(input, "repairs.pay", approveAmountSchema, (tx, actor, data: { faultId: string; amount: number; reason?: string }) => approveRepairAmount(tx, actor, data));
}

export async function recordRepairPayoutAction(input: unknown) {
  return run(input, "repairs.pay", payoutSchema, (tx, actor, data: { faultId: string; amount: number; method: "CASH" | "BANK_TRANSFER" | "UPI" | "OTHER"; reference: string; paidOn?: string; note: string }) =>
    recordRepairPayout(tx, actor, { ...data, paidAt: noonOf(data.paidOn) }));
}
