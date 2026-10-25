"use server";

import { prisma } from "@/lib/db";
import { invalid, revalidate, slugOf, staffAction } from "@/lib/actionAccess";
import { PoolNotFoundError } from "@/lib/consumables/ledger";
import { noonOf, toBuyRequestSchema, toBuyStepSchema } from "@/lib/repairs/schemas";
import { advanceToBuy, requestToBuy, ToBuyError, ToBuyNotFoundError, type ToBuyStep } from "@/lib/repairs/toBuy";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import type { ActionResult } from "./space";

/** Staff who keep machines going ask for parts and consumables; the machine manager approves, buys and receives. */
export async function requestToBuyAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "tobuy.request");
  if (!access.ok) return access;
  const parsed = toBuyRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await prisma.$transaction((tx) => requestToBuy(tx, { spaceId: access.space.id, actorId: access.userId }, parsed.data));
  } catch (error) {
    if (error instanceof ToBuyNotFoundError) return { ok: false, error: "Space not found." };
    if (error instanceof ToBuyError) return { ok: false, error: error.message };
    throw error;
  }
  revalidate(`/dashboard/${access.space.slug}/to-buy`);
  return { ok: true };
}

export async function advanceToBuyAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "tobuy.manage");
  if (!access.ok) return access;
  const parsed = toBuyStepSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;
  const step: ToBuyStep = data.status === "BOUGHT"
    ? { status: "BOUGHT", amount: data.amount ?? 0, method: data.method ?? "CASH", reference: data.reference, supplier: data.supplier, boughtAt: noonOf(data.boughtOn) }
    : { status: data.status };
  try {
    const result = await prisma.$transaction((tx) => advanceToBuy(tx, { spaceId: access.space.id, actorId: access.userId }, data.itemId, step));
    if (result.webhookDeliveryIds.length) await enqueueWebhookDeliveries(result.webhookDeliveryIds);
  } catch (error) {
    if (error instanceof ToBuyNotFoundError) return { ok: false, error: "Space not found." };
    if (error instanceof ToBuyError || error instanceof PoolNotFoundError) return { ok: false, error: error.message };
    throw error;
  }
  revalidate(`/dashboard/${access.space.slug}`, "layout");
  return { ok: true };
}
