import "server-only";

import type { Prisma, SpaceRole } from "@prisma/client";
import { queueChatAlerts } from "@/lib/chat/notify";
import { enqueueOutbox } from "@/lib/outbox";
import { CAPABILITIES } from "@/lib/permissionRoles";
import { emitWebhook } from "@/lib/webhooks/emit";

/**
 * A pool just crossed its low-stock threshold (lib/consumables/ledger.ts calls this once per crossing). When
 * the space keeps low-stock alerts on, every staff member who manages consumables gets an email and the chat
 * channels that asked for it get a message; the `consumable.low_stock` webhook goes out either way. All of it
 * is queued in the caller's transaction and delivered after commit.
 */
export async function queueLowStockAlert(tx: Prisma.TransactionClient, pool: { id: string; spaceId: string; material: string; unit: string; remainingQuantity: string; lowThreshold: string | null }) {
  const settings = await tx.spaceJobSettings.findUnique({ where: { spaceId: pool.spaceId }, select: { lowStockAlerts: true } });
  if (settings?.lowStockAlerts ?? true) {
    const roles = CAPABILITIES["consumables.manage"] as readonly SpaceRole[];
    const staff = await tx.spaceMember.findMany({
      where: { spaceId: pool.spaceId, status: "ACTIVE", role: { in: [...roles] }, user: { email: { not: null }, emailVerified: { not: null } } },
      select: { user: { select: { email: true } } },
      take: 50,
    });
    for (const email of new Set(staff.map((member) => member.user.email!.toLowerCase()))) {
      await enqueueOutbox(tx, "consumable-low-stock", { to: email, spaceId: pool.spaceId, poolId: pool.id });
    }
    await queueChatAlerts(tx, pool.spaceId, "consumable-low-stock", { poolId: pool.id });
  }
  return emitWebhook(tx, pool.spaceId, "consumable.low_stock", {
    poolId: pool.id,
    material: pool.material,
    unit: pool.unit,
    remainingQuantity: pool.remainingQuantity,
    lowThreshold: pool.lowThreshold,
  });
}
