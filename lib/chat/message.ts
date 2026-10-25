import "server-only";

import { prisma } from "@/lib/db";
import { absoluteUrl } from "@/lib/email/message";
import type { ChatEvent } from "./events";
import { upkeepMessage } from "./upkeepMessage";
import { formatQuantity } from "@/lib/consumables/math";
import { METERING_UNIT_LABELS } from "@/lib/machines/presets";

/** Ids only, so nothing personal sits in the queue. */
export type ChatRefs = { memberId?: string; poolId?: string; jobId?: string; machineId?: string; faultId?: string; scheduleId?: string };

/**
 * The plain-text alert for one event, built when it is sent. Null when the record has gone (the alert is
 * dropped). Names appear only when the channel asks for them.
 */
export async function chatMessage(spaceId: string, event: ChatEvent, refs: ChatRefs, includeNames: boolean): Promise<string | null> {
  const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { name: true, slug: true } });
  if (!space) return null;
  if (event === "consumable-low-stock") return lowStockMessage(space, refs.poolId);
  if (event === "maintenance-due" || event === "fault-reported" || event === "fault-assigned" || event === "fault-resolved" || event === "repair-payment" || event === "warranty-expiring") {
    return upkeepMessage(spaceId, space, event, refs);
  }
  if (event.startsWith("job-") && refs.jobId) {
    const job = await prisma.job.findFirst({ where: { id: refs.jobId, spaceId }, select: { number: true, title: true } });
    return job ? `${space.name}: J-${String(job.number).padStart(4, "0")} ${event.slice(4)}${includeNames ? `: ${job.title}` : "."}\n${absoluteUrl(`/dashboard/${space.slug}/jobs/${job.number}`)}` : null;
  }
  if (!refs.memberId) return null;
  const member = await prisma.spaceMember.findFirst({ where: { id: refs.memberId, spaceId }, select: { user: { select: { name: true } } } });
  if (!member && event !== "member-left") return null;
  const who = includeNames && member?.user.name ? member.user.name : "A maker";
  const line = (text: string) => `${space.name}: ${text}\n${absoluteUrl(`/dashboard/${space.slug}/team`)}`;
  if (event === "join-request") return line(`${who} asked to join. Review it:`);
  if (event === "member-joined") return line(`${who} joined.`);
  return line(`${includeNames && member?.user.name ? member.user.name : "A maker"} left.`);
}

async function lowStockMessage(space: { name: string; slug: string }, poolId: string | undefined) {
  if (!poolId) return null;
  const pool = await prisma.consumablePool.findFirst({ where: { id: poolId, space: { slug: space.slug } }, select: { material: true, colour: true, unit: true, remainingQuantity: true, isActive: true, lowAlertedAt: true } });
  if (!pool?.isActive || !pool.lowAlertedAt) return null;
  const label = [pool.material, pool.colour].filter(Boolean).join(" ");
  return `${space.name}: ${label} is running low (${formatQuantity(pool.remainingQuantity.toString())} ${METERING_UNIT_LABELS[pool.unit].short} left).\n${absoluteUrl(`/dashboard/${space.slug}/consumables`)}`;
}
