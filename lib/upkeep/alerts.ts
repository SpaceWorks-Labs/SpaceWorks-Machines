import "server-only";
import type { Prisma, SpaceRole } from "@prisma/client";
import { queueChatAlerts } from "@/lib/chat/notify";
import type { ChatEvent } from "@/lib/chat/events";
import { enqueueOutbox } from "@/lib/outbox";
import { CAPABILITIES } from "@/lib/permissionRoles";
import { rolesForType } from "@/lib/typeScope";
import type { UpkeepEmailEvent } from "@/lib/email/upkeep";

const CHAT: Partial<Record<UpkeepEmailEvent, ChatEvent>> = {
  "maintenance-due": "maintenance-due", "fault-reported": "fault-reported", "warranty-expiring": "warranty-expiring",
};

/**
 * Email every verified staff member who manages maintenance, and the chat channels that asked for the event.
 * Queued in the caller's transaction, delivered after commit.
 */
export async function queueUpkeepAlert(tx: Prisma.TransactionClient, spaceId: string, machineId: string, event: UpkeepEmailEvent, refId?: string) {
  const roles = CAPABILITIES["maintenance.manage"] as readonly SpaceRole[];
  const machine = await tx.machine.findUniqueOrThrow({ where: { spaceId_id: { spaceId, id: machineId } }, select: { typeId: true } });
  const staff = await tx.spaceMember.findMany({
    where: { spaceId, status: "ACTIVE", ...rolesForType(roles, machine.typeId), user: { email: { not: null }, emailVerified: { not: null } } },
    select: { user: { select: { email: true } } }, take: 50,
  });
  for (const email of new Set(staff.map((member) => member.user.email!.toLowerCase()))) {
    await enqueueOutbox(tx, "upkeep-staff", { to: email, spaceId, machineId, event, ...(refId ? { refId } : {}) });
  }
  const chat = CHAT[event];
  if (chat) await queueChatAlerts(tx, spaceId, chat, { machineId, ...(event === "fault-reported" ? { faultId: refId } : event === "maintenance-due" ? { scheduleId: refId } : {}) });
}
