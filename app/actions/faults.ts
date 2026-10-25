"use server";

import { prisma } from "@/lib/db";
import { invalid, refreshMachinePages, revalidate } from "@/lib/actionAccess";
import { requesterAction } from "@/lib/jobs/actionSupport";
import { can, isStaffRole, spaceAllows } from "@/lib/permissionRoles";
import { reportFault, UpkeepError, UpkeepNotFoundError } from "@/lib/upkeep";
import { reportFaultSchema } from "@/lib/upkeep/schemas";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import type { ActionResult } from "./space";

/**
 * Report a problem with a machine. Any active member of an active space may report on a machine they can see
 * (makers: public machines only); only staff who manage maintenance may take the machine offline with it.
 */
export async function reportFaultAction(input: unknown): Promise<ActionResult<{ number: number; id: string }>> {
  const access = await requesterAction(input);
  if (!access.ok) return access;
  const notFound = { ok: false as const, error: "Space not found." };
  if (access.membership?.status !== "ACTIVE" || access.space.status !== "ACTIVE") return notFound;
  const parsed = reportFaultSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const staff = isStaffRole(access.membership.role);
  const machine = await prisma.machine.findFirst({ where: { spaceId: access.space.id, id: parsed.data.machineId, retiredAt: null, ...(staff ? {} : { isPublic: true }) }, select: { id: true } });
  if (!machine) return notFound;
  const canTakeOffline = staff && can(access.membership.role, "maintenance.manage") && spaceAllows(access.space.status, "maintenance.manage");
  try {
    const result = await prisma.$transaction((tx) => reportFault(tx, { spaceId: access.space.id, actorId: access.userId },
      { ...parsed.data, takeOffline: canTakeOffline && parsed.data.takeOffline }));
    await enqueueWebhookDeliveries(result.webhookDeliveryIds);
    refreshMachinePages(access.space.slug);
    revalidate(`/dashboard/${access.space.slug}/maintenance`, "layout");
    return { ok: true, data: { number: result.fault.number, id: result.fault.id } };
  } catch (error) {
    if (error instanceof UpkeepNotFoundError) return notFound;
    if (error instanceof UpkeepError) return { ok: false, error: error.message };
    throw error;
  }
}
