"use server";

import { prisma } from "@/lib/db";
import { invalid, revalidate } from "@/lib/actionAccess";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordFix } from "@/lib/repairs/fix";
import { ANSWER_ERRORS, answerRepairRequest, RepairError, RepairNotFoundError, requestForToken } from "@/lib/repairs/requests";
import { linkAnswerSchema, linkFixSchema } from "@/lib/repairs/schemas";
import type { ActionResult } from "./space";

/**
 * An external technician's private link (no account): accept or decline, then record the fix. The link alone
 * authorises exactly one request; anything else, an expired or closed link included, is not found.
 */
const GONE = { ok: false as const, error: "This link has expired or is no longer valid." };
const TOO_MANY = { ok: false as const, error: "Too many requests. Try again shortly." };

export async function answerRepairLinkAction(input: unknown): Promise<ActionResult> {
  const parsed = linkAnswerSchema.safeParse(input);
  if (!parsed.success) return GONE;
  if (await isActionRateLimited("repairLink", parsed.data.token)) return TOO_MANY;
  const request = await requestForToken(prisma, parsed.data.token);
  if (!request || request.status !== "SENT") return GONE;
  try {
    const { outcome } = await prisma.$transaction((tx) => answerRepairRequest(tx, { spaceId: request.spaceId, requestId: request.id, technicianId: request.technicianId,
      accept: parsed.data.accept, actorId: null }));
    if (ANSWER_ERRORS[outcome]) return { ok: false, error: ANSWER_ERRORS[outcome]! };
  } catch (error) {
    if (error instanceof RepairNotFoundError) return GONE;
    if (error instanceof RepairError) return { ok: false, error: error.message };
    throw error;
  }
  revalidate(`/dashboard/${request.fault.machine.space.slug}`, "layout");
  return { ok: true };
}

export async function recordRepairLinkFixAction(input: unknown): Promise<ActionResult> {
  const parsed = linkFixSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.some((issue) => issue.path[0] === "token") ? GONE : invalid(parsed.error);
  if (await isActionRateLimited("repairLink", parsed.data.token)) return TOO_MANY;
  const request = await requestForToken(prisma, parsed.data.token);
  if (!request || request.status !== "ACCEPTED") return GONE;
  try {
    await prisma.$transaction((tx) => recordFix(tx, { spaceId: request.spaceId, faultId: request.faultId, technicianId: request.technicianId, actorId: null,
      remarks: parsed.data.remarks, parts: parsed.data.parts, amountAsked: parsed.data.amountAsked, fixed: parsed.data.fixed }));
  } catch (error) {
    if (error instanceof RepairNotFoundError) return GONE;
    if (error instanceof RepairError) return { ok: false, error: error.message };
    throw error;
  }
  revalidate(`/dashboard/${request.fault.machine.space.slug}`, "layout");
  return { ok: true };
}
