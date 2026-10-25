import "server-only";
import type { Prisma } from "@prisma/client";

/** Shown whenever a change would leave a space without an active machine manager. */
export const LAST_MANAGER_MESSAGE = "A space needs at least one active machine manager. Make someone else a machine manager first.";

/**
 * True when this member is the space's only active machine manager, so removing, demoting or the member leaving
 * must be refused. Locks the space row first so two concurrent changes can't both pass the check.
 */
export async function isLastActiveManager(tx: Prisma.TransactionClient, spaceId: string, memberId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Space" WHERE "id" = ${spaceId} FOR UPDATE`;
  const member = await tx.spaceMember.findFirst({ where: { id: memberId, spaceId }, select: { role: true, status: true } });
  if (member?.role !== "MACHINE_MANAGER" || member.status !== "ACTIVE") return false;
  const others = await tx.spaceMember.count({ where: { spaceId, role: "MACHINE_MANAGER", status: "ACTIVE", id: { not: memberId } } });
  return others === 0;
}
