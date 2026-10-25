"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { recordSettingsChange } from "@/lib/audit";
import { invalid, revalidate, slugOf, staffAction } from "@/lib/actionAccess";
import type { ActionResult } from "./space";

/**
 * Whole-space policy in SpaceJobSettings that machine managers own. Phase 2 needs only the low-stock alert switch;
 * Phase 3 adds the job, payment and notification policy here. Every change is audited with before and after.
 */
export async function setLowStockAlerts(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "space.settings");
  if (!access.ok) return access;
  const parsed = z.object({ lowStockAlerts: z.boolean() }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await prisma.$transaction(async (tx) => {
    const before = await tx.spaceJobSettings.upsert({ where: { spaceId: access.space.id }, create: { spaceId: access.space.id }, update: {}, select: { lowStockAlerts: true } });
    await tx.spaceJobSettings.update({ where: { spaceId: access.space.id }, data: { lowStockAlerts: parsed.data.lowStockAlerts, updatedById: access.userId } });
    await recordSettingsChange({ spaceId: access.space.id, actorUserId: access.userId, area: "space.notifications", before, after: parsed.data, client: tx });
  });
  revalidate(`/dashboard/${access.space.slug}/settings/notifications`);
  revalidate(`/dashboard/${access.space.slug}/consumables`, "layout");
  return { ok: true };
}
