"use server";

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { invalid, slugOf, staffAction, isUniqueViolation } from "@/lib/actionAccess";
import { recordSettingsChange } from "@/lib/audit";
import { jobSettingsSchema, moneySettingsSchema, pricingRuleSchema } from "@/lib/jobs/settingsSchemas";
import { id } from "@/lib/jobs/actionSchemas";
import { refreshJobs } from "@/lib/jobs/actionSupport";
import { inScope } from "@/lib/typeScope";
import type { ActionResult } from "./space";

export async function saveJobSettingsAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "machine.settings");
  if (!access.ok) return access;
  const parsed = z.object({ values: jobSettingsSchema }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await prisma.$transaction(async (tx) => {
    await tx.spaceJobSettings.upsert({ where: { spaceId: access.space.id }, create: { spaceId: access.space.id, ...parsed.data.values, updatedById: access.userId }, update: { ...parsed.data.values, updatedById: access.userId } });
    await recordSettingsChange({ spaceId: access.space.id, actorUserId: access.userId, area: "machine.jobs", fields: Object.keys(parsed.data.values), client: tx });
  });
  refreshJobs(access.space.slug);
  return { ok: true };
}

export async function saveJobMoneySettingsAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "payments.settings");
  if (!access.ok) return access;
  const parsed = z.object({ values: moneySettingsSchema }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await prisma.$transaction(async (tx) => {
    await tx.spaceJobSettings.upsert({ where: { spaceId: access.space.id }, create: { spaceId: access.space.id, ...parsed.data.values, updatedById: access.userId }, update: { ...parsed.data.values, updatedById: access.userId } });
    await recordSettingsChange({ spaceId: access.space.id, actorUserId: access.userId, area: "space.job-payments", fields: Object.keys(parsed.data.values), client: tx });
  });
  refreshJobs(access.space.slug);
  return { ok: true };
}

/**
 * Pricing rules for a type or a machine are type settings; a machine type manager may edit them only for their
 * types (anything else reads as not found). Space-default rules (no type, no machine) need machine.settings.
 */
export async function savePricingRuleAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "type.settings");
  if (!access.ok) return access;
  const parsed = pricingRuleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { ruleId, ...values } = parsed.data;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const spaceId = access.space.id;
      // Serialise concurrent edits to this space's pricing rules.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pricing:${spaceId}`}, 0))::text`;
      if (ruleId && !await tx.pricingRule.findFirst({ where: { spaceId, id: ruleId } })) return false;
      if (values.typeId && !await tx.machineType.findFirst({ where: { spaceId, id: values.typeId } })) return false;
      if (values.machineId && !await tx.machine.findFirst({ where: { spaceId, id: values.machineId, ...(values.typeId ? { typeId: values.typeId } : {}) } })) return false;
      if (access.typeScope !== null) {
        if (ruleId && !await ruleInScope(tx, spaceId, ruleId, access.typeScope)) return false;
        if (!values.typeId && !values.machineId) return false;
        if (!await targetInScope(tx, spaceId, values, access.typeScope)) return false;
      }
      const settings = await tx.spaceJobSettings.findUnique({ where: { spaceId } });
      if (values.paymentTiming === "PAY_LATER" && settings?.allowPayLater === false) return "Enable pay later in space payment settings first.";
      if (await tx.pricingRule.findFirst({ where: { spaceId, typeId: values.typeId, machineId: values.machineId, audience: values.audience, ...(ruleId ? { id: { not: ruleId } } : {}) } })) return "A pricing rule already exists for this scope and audience.";
      const row = ruleId ? await tx.pricingRule.update({ where: { id: ruleId }, data: { ...values, updatedById: access.userId } }) : await tx.pricingRule.create({ data: { spaceId, ...values, updatedById: access.userId } });
      await recordSettingsChange({ spaceId, actorUserId: access.userId, area: "machine.pricing", fields: Object.keys(values), targetType: "PricingRule", targetId: row.id, client: tx });
      return true;
    });
    if (result !== true) return { ok: false, error: result || "Space not found." };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "A pricing rule already exists for this scope and audience." };
    throw error;
  }
  refreshJobs(access.space.slug);
  return { ok: true };
}

export async function deletePricingRuleAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "type.settings");
  if (!access.ok) return access;
  const parsed = z.object({ ruleId: id }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const count = await prisma.$transaction(async (tx) => {
    if (access.typeScope !== null && !await ruleInScope(tx, access.space.id, parsed.data.ruleId, access.typeScope)) return 0;
    const deleted = await tx.pricingRule.deleteMany({ where: { spaceId: access.space.id, id: parsed.data.ruleId } });
    if (deleted.count) await recordSettingsChange({ spaceId: access.space.id, actorUserId: access.userId, area: "machine.pricing", fields: ["deleted"], targetType: "PricingRule", targetId: parsed.data.ruleId, client: tx });
    return deleted.count;
  });
  if (!count) return { ok: false, error: "Space not found." };
  refreshJobs(access.space.slug);
  return { ok: true };
}

type Tx = Prisma.TransactionClient;

/** The type a rule (or its machine) prices must be one the actor manages; space-default rules never are. */
async function targetInScope(tx: Tx, spaceId: string, target: { typeId?: string | null; machineId?: string | null }, scope: string[]) {
  if (target.typeId) return inScope(scope, target.typeId);
  if (!target.machineId) return false;
  const machine = await tx.machine.findFirst({ where: { spaceId, id: target.machineId }, select: { typeId: true } });
  return inScope(scope, machine?.typeId);
}

async function ruleInScope(tx: Tx, spaceId: string, ruleId: string, scope: string[]) {
  const rule = await tx.pricingRule.findFirst({ where: { spaceId, id: ruleId }, select: { typeId: true, machineId: true } });
  return rule !== null && targetInScope(tx, spaceId, rule, scope);
}
