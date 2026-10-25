"use server";

import { prisma } from "@/lib/db";
import { invalid, revalidate, slugOf, staffAction } from "@/lib/actionAccess";
import { FinanceError, postManualEntry, reverseFinanceEntry } from "@/lib/finance/post";
import { manualEntrySchema, noonOf, reverseEntrySchema } from "@/lib/repairs/schemas";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import type { ActionResult } from "./space";

/** Finance belongs to the machine manager alone (owner decision 2026-10-24). */
async function finish(slug: string, ids: string[]): Promise<ActionResult> {
  if (ids.length) await enqueueWebhookDeliveries(ids);
  revalidate(`/dashboard/${slug}/finance`);
  revalidate(`/dashboard/${slug}`);
  return { ok: true };
}

export async function addFinanceEntryAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "finance.manage");
  if (!access.ok) return access;
  const parsed = manualEntrySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const result = await prisma.$transaction((tx) => postManualEntry(tx, { spaceId: access.space.id, actorId: access.userId },
      { ...parsed.data, amountMinor: parsed.data.amount, occurredAt: noonOf(parsed.data.occurredOn) ?? new Date() }));
    return finish(access.space.slug, result.webhookDeliveryIds);
  } catch (error) {
    if (error instanceof FinanceError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function reverseFinanceEntryAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "finance.manage");
  if (!access.ok) return access;
  const parsed = reverseEntrySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const result = await prisma.$transaction((tx) => reverseFinanceEntry(tx, { spaceId: access.space.id, actorId: access.userId }, parsed.data.entryId, parsed.data.reason));
    return finish(access.space.slug, result.webhookDeliveryIds);
  } catch (error) {
    if (error instanceof FinanceError) return { ok: false, error: error.message === "Entry not found." ? "Space not found." : error.message };
    throw error;
  }
}
