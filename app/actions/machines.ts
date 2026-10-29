"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { invalid, refreshMachinePages, slugOf, staffAction, type Failure } from "@/lib/actionAccess";
import { isCurrencyCode, parseAmount } from "@/lib/money/currencies";
import { can } from "@/lib/permissionRoles";
import { changeMachineStatus, createMachine, MachineInputError, MachineNotFoundError, setMachineFlags, setMachineRetired, updateMachine, type MachineDetails } from "@/lib/machines/machines";
import { createMachineSchema, machineDetailsSchema, machineStatusSchema } from "@/lib/machines/schemas";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import { TypeNotFoundError } from "@/lib/machines/types";
import { calendarDayAt, parseCalendarDay } from "@/lib/calendarDay";
import type { ActionResult } from "./space";

const NOT_FOUND = { ok: false as const, error: "Machine not found." };
const machineId = z.string().trim().min(1).max(64);

function failure(error: unknown): Failure {
  if (error instanceof MachineNotFoundError) return NOT_FOUND;
  if (error instanceof TypeNotFoundError) return { ok: false, error: error.message };
  if (error instanceof MachineInputError) return { ok: false, error: error.fieldErrors._root?.[0] ?? error.message, fieldErrors: error.fieldErrors };
  throw error;
}

/** Details as typed, with the purchase cost turned into minor units of the space's currency. */
async function details(spaceId: string, values: z.infer<typeof machineDetailsSchema>, money = true): Promise<MachineDetails | Failure> {
  let purchaseCost: number | null | undefined = money ? null : undefined;
  const space = await prisma.space.findUniqueOrThrow({ where: { id: spaceId }, select: { currency: true, timezone: true } });
  if (values.purchaseCost && money) {
    purchaseCost = isCurrencyCode(space.currency) ? parseAmount(values.purchaseCost, space.currency) : null;
    if (purchaseCost === null) return { ok: false, error: "Check the highlighted fields.", fieldErrors: { purchaseCost: ["Enter an amount like 125000 or 1,25,000.50"] } };
  }
  const acquiredOn = values.acquiredOn ? parseCalendarDay(values.acquiredOn) : null;
  if (values.acquiredOn && (!acquiredOn || values.acquiredOn > calendarDayAt(new Date(), space.timezone))) return { ok: false, error: "Check the highlighted fields.", fieldErrors: { acquiredOn: ["Enter a date that isn't in the future"] } };
  return { ...values, purchaseCost, acquiredOn };
}

/** Add a machine. Its type is chosen here and never changes. */
export async function createMachineAction(input: unknown): Promise<ActionResult<{ slug: string; missingSpecs: string[] }>> {
  const access = await staffAction(slugOf(input), "machines.manage");
  if (!access.ok) return access;
  const parsed = createMachineSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const clean = await details(access.space.id, parsed.data, can(access.membership.role, "finance.view"));
  if ("ok" in clean) return clean;
  try {
    const created = await prisma.$transaction((tx) => createMachine(tx, { ...clean, spaceId: access.space.id, actorId: access.userId, typeId: parsed.data.typeId, isPublic: parsed.data.isPublic, acceptsJobs: parsed.data.acceptsJobs }));
    await enqueueWebhookDeliveries(created.webhookDeliveryIds);
    refreshMachinePages(access.space.slug);
    return { ok: true, data: { slug: created.slug, missingSpecs: created.missingSpecs } };
  } catch (error) {
    return failure(error);
  }
}

export async function updateMachineAction(input: unknown): Promise<ActionResult<{ missingSpecs: string[] }>> {
  const access = await staffAction(slugOf(input), "machines.manage");
  if (!access.ok) return access;
  const parsed = machineDetailsSchema.extend({ machineId }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const clean = await details(access.space.id, parsed.data, can(access.membership.role, "finance.view"));
  if ("ok" in clean) return clean;
  try {
    const result = await prisma.$transaction((tx) => updateMachine(tx, { ...clean, spaceId: access.space.id, actorId: access.userId, machineId: parsed.data.machineId }));
    await enqueueWebhookDeliveries(result.webhookDeliveryIds);
    refreshMachinePages(access.space.slug);
    return { ok: true, data: { missingSpecs: result.missingSpecs } };
  } catch (error) {
    return failure(error);
  }
}

/** Idle, reserved, maintenance or offline, with a note: operators, technicians and machine managers. */
export async function changeMachineStatusAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "machines.status");
  if (!access.ok) return access;
  const parsed = machineStatusSchema.extend({ machineId }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const result = await prisma.$transaction((tx) => changeMachineStatus(tx, { spaceId: access.space.id, actorId: access.userId, ...parsed.data }));
    await enqueueWebhookDeliveries(result.webhookDeliveryIds);
  } catch (error) {
    return failure(error);
  }
  refreshMachinePages(access.space.slug);
  return { ok: true };
}

export async function setMachineRetiredAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "machines.manage");
  if (!access.ok) return access;
  const parsed = z.object({ machineId, retired: z.boolean() }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const result = await prisma.$transaction((tx) => setMachineRetired(tx, { spaceId: access.space.id, actorId: access.userId, ...parsed.data }));
    await enqueueWebhookDeliveries(result.webhookDeliveryIds);
  } catch (error) {
    return failure(error);
  }
  refreshMachinePages(access.space.slug);
  return { ok: true };
}

/** The public listing and job intake switches, saved as soon as they change. */
export async function setMachineFlagsAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "machines.manage");
  if (!access.ok) return access;
  const parsed = z.object({ machineId, isPublic: z.boolean().optional(), acceptsJobs: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const result = await prisma.$transaction((tx) => setMachineFlags(tx, { spaceId: access.space.id, actorId: access.userId, ...parsed.data }));
    await enqueueWebhookDeliveries(result.webhookDeliveryIds);
  } catch (error) {
    return failure(error);
  }
  refreshMachinePages(access.space.slug);
  return { ok: true };
}
