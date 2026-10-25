"use server";

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { invalid, refreshMachinePages, revalidate, slugOf, staffAction, type Failure } from "@/lib/actionAccess";
import { isCurrencyCode, parseAmount } from "@/lib/money/currencies";
import { can } from "@/lib/permissionRoles";
import { JobGuardError } from "@/lib/jobs/context";
import { recordUsage } from "@/lib/usage/record";
import { createSchedule, endDowntime, logMaintenance, saveWarranty, startDowntime, updateFault, updateSchedule,
  UpkeepError, UpkeepNotFoundError } from "@/lib/upkeep";
import { createScheduleSchema, endDowntimeSchema, logSchema, manualUsageSchema, startDowntimeSchema, updateFaultSchema,
  updateScheduleSchema, warrantySchema } from "@/lib/upkeep/schemas";
import { MachineInputError } from "@/lib/machines/machines";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import type { ActionResult } from "./space";

function failure(error: unknown): Failure {
  if (error instanceof UpkeepNotFoundError) return { ok: false, error: "Space not found." };
  if (error instanceof UpkeepError || error instanceof JobGuardError) return { ok: false, error: error.message };
  if (error instanceof MachineInputError) return { ok: false, error: error.fieldErrors._root?.[0] ?? Object.values(error.fieldErrors)[0]?.[0] ?? error.message };
  throw error;
}

type Access = Extract<Awaited<ReturnType<typeof staffAction>>, { ok: true }>;
/** Gate, parse, run in one transaction, deliver webhooks after commit, refresh the pages that show upkeep. */
async function run<S extends z.ZodTypeAny, T>(input: unknown, schema: S, work: (tx: Prisma.TransactionClient, access: Access, data: z.infer<S>) => Promise<T & { webhookDeliveryIds?: string[] }>,
  capability: Parameters<typeof staffAction>[1] = "maintenance.manage"): Promise<ActionResult<T>> {
  const access = await staffAction(slugOf(input), capability);
  if (!access.ok) return access;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { webhookDeliveryIds, ...result } = await prisma.$transaction((tx) => work(tx, access, parsed.data));
    await enqueueWebhookDeliveries(webhookDeliveryIds ?? []);
    refreshMachinePages(access.space.slug);
    revalidate(`/dashboard/${access.space.slug}/maintenance`, "layout");
    return { ok: true, data: result as T };
  } catch (error) {
    return failure(error);
  }
}

const actor = (access: Access) => ({ spaceId: access.space.id, actorId: access.userId });

export async function createScheduleAction(input: unknown) {
  return run(input, createScheduleSchema, async (tx, access, data) => ({ id: (await createSchedule(tx, { ...actor(access), machineId: data.machineId }, data)).id }));
}

export async function updateScheduleAction(input: unknown) {
  return run(input, updateScheduleSchema, async (tx, access, data) => ({ id: (await updateSchedule(tx, { ...actor(access), scheduleId: data.scheduleId }, data)).id }));
}

export async function logMaintenanceAction(input: unknown) {
  return run(input, logSchema, async (tx, access, data) => {
    const space = await tx.space.findUniqueOrThrow({ where: { id: access.space.id }, select: { currency: true } });
    // Money is the machine manager's: anyone else logs the work without a cost.
    const money = can(access.membership.role, "finance.view");
    const cost = data.cost && money ? (isCurrencyCode(space.currency) ? parseAmount(data.cost, space.currency) : null) : null;
    if (data.cost && money && cost === null) throw new UpkeepError("Enter the cost as an amount, like 1500 or 1,500.50.");
    const performedAt = data.performedOn ? new Date(`${data.performedOn}T12:00:00Z`) : undefined;
    const { log, webhookDeliveryIds } = await logMaintenance(tx, actor(access), { ...data, cost, performedAt });
    return { id: log.id, webhookDeliveryIds };
  });
}

export async function startDowntimeAction(input: unknown) {
  return run(input, startDowntimeSchema, async (tx, access, data) => {
    const { downtime, webhookDeliveryIds } = await startDowntime(tx, actor(access), data);
    return { id: downtime.id, webhookDeliveryIds };
  });
}

export async function endDowntimeAction(input: unknown) {
  return run(input, endDowntimeSchema, async (tx, access, data) => ({ ...(await endDowntime(tx, actor(access), data)) }));
}

export async function updateFaultAction(input: unknown) {
  return run(input, updateFaultSchema, async (tx, access, data) => {
    const { fault, webhookDeliveryIds } = await updateFault(tx, actor(access), data);
    return { status: fault.status, webhookDeliveryIds };
  });
}

export async function saveWarrantyAction(input: unknown) {
  return run(input, warrantySchema, async (tx, access, data) => ({ id: (await saveWarranty(tx, { ...actor(access), machineId: data.machineId }, data)).id }));
}

/** Operators log a run outside the queue; recordUsage re-checks jobs.operate and pool rules. */
export async function logManualUsageAction(input: unknown) {
  return run(input, manualUsageSchema, async (tx, access, data) => {
    const pool = data.poolId ? await tx.consumablePool.findFirst({ where: { spaceId: access.space.id, id: data.poolId }, select: { unit: true } }) : null;
    if (data.poolId && !pool) throw new UpkeepNotFoundError();
    const { log, webhookDeliveryIds } = await recordUsage(tx, { spaceId: access.space.id, machineId: data.machineId, source: "MANUAL", actorId: access.userId,
      minutes: data.minutes, succeeded: data.succeeded, note: data.note, ...(pool ? { poolId: data.poolId!, quantity: data.quantity, unit: pool.unit } : {}) });
    return { id: log.id, webhookDeliveryIds };
  }, "jobs.operate");
}
