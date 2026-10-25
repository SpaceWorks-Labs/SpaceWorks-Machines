import "server-only";
import type { Prisma, SpaceRole } from "@prisma/client";
import { enqueueOutbox } from "@/lib/outbox";
import { CAPABILITIES } from "@/lib/permissionRoles";

/** An endpoint was switched off after repeated failures: tell everyone who manages integrations. */
export async function queueEndpointDisabledAlert(tx: Prisma.TransactionClient, spaceId: string, endpointId: string) {
  const roles = CAPABILITIES["integrations.manage"] as readonly SpaceRole[];
  const staff = await tx.spaceMember.findMany({
    where: { spaceId, status: "ACTIVE", role: { in: [...roles] }, user: { email: { not: null }, emailVerified: { not: null } } },
    select: { user: { select: { email: true } } }, take: 50,
  });
  for (const email of new Set(staff.map((member) => member.user.email!.toLowerCase()))) {
    await enqueueOutbox(tx, "webhook-disabled", { to: email, spaceId, endpointId });
  }
}
