import "server-only";
import type { FaultReport, SpaceMember, SpaceStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { machineFileUrl } from "@/lib/machines/fileAccess";
import { can, spaceAllows, type Capability } from "@/lib/permissionRoles";

/**
 * The repair part of a fault page. Money is the machine manager's (finance), except that a technician sees the
 * amount they asked and whether it was paid on a repair they took (owner decision 2026-10-24).
 */
export async function loadRepairPanel(space: { id: string; status: SpaceStatus }, fault: FaultReport, membership: SpaceMember) {
  const allowed = (capability: Capability) => can(membership.role, capability) && spaceAllows(space.status, capability);
  const [requests, technicians, fixPhotos, payouts, mine] = await Promise.all([
    prisma.repairRequest.findMany({ where: { spaceId: space.id, faultId: fault.id }, orderBy: { sentAt: "asc" }, include: { technician: { select: { name: true, kind: true } } } }),
    allowed("repairs.request") ? prisma.technician.findMany({ where: { spaceId: space.id, isActive: true }, orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true, skills: true, email: true, whatsapp: true, telegramChatId: true } }) : [],
    prisma.faultPhoto.findMany({ where: { spaceId: space.id, faultId: fault.id, stage: "FIX" }, select: { id: true, storageKey: true } }),
    allowed("repairs.pay") ? prisma.repairPayout.findMany({ where: { spaceId: space.id, faultId: fault.id }, orderBy: { paidAt: "asc" } }) : [],
    prisma.technician.findFirst({ where: { spaceId: space.id, userId: membership.userId }, select: { id: true } }),
  ]);
  const assigned = fault.technicianId ? await prisma.technician.findFirst({ where: { spaceId: space.id, id: fault.technicianId }, select: { id: true, name: true, kind: true } }) : null;
  const isAssignedTechnician = Boolean(mine && assigned && mine.id === assigned.id);
  const seesMoney = allowed("repairs.pay");
  return {
    canRequest: allowed("repairs.request") && !fault.technicianId && !["RESOLVED", "WONT_FIX"].includes(fault.status),
    canVerify: allowed("repairs.verify") && fault.status === "FIXED",
    canPay: seesMoney && fault.technicianId !== null,
    canRecordFix: isAssignedTechnician && !["RESOLVED", "WONT_FIX", "FIXED"].includes(fault.status),
    myPendingRequestId: mine ? requests.find((row) => row.technicianId === mine.id && row.status === "SENT" && row.expiresAt > new Date())?.id ?? null : null,
    technician: assigned,
    fix: { remarks: fault.fixRemarks, parts: fault.fixParts, fixedAt: fault.fixedAt?.toISOString() ?? null, reopenReason: fault.reopenReason,
      photos: fixPhotos.map((photo) => ({ id: photo.id, url: machineFileUrl(photo.storageKey) })) },
    money: seesMoney || isAssignedTechnician ? { amountAsked: fault.amountAsked, payoutStatus: fault.payoutStatus,
      ...(seesMoney ? { approvedAmount: fault.approvedAmount, paidAmount: fault.paidAmount, amountChangeReason: fault.amountChangeReason } : {}) } : null,
    payouts: payouts.map((row) => ({ id: row.id, amount: row.amount, currency: row.currency, method: row.method, reference: row.reference, paidAt: row.paidAt.toISOString() })),
    timeline: requests.map((row) => ({ id: row.id, technician: row.technician.name, kind: row.technician.kind, status: row.status === "SENT" && row.expiresAt <= new Date() ? "EXPIRED" : row.status,
      channels: row.channels, sentAt: row.sentAt.toISOString(), respondedAt: row.respondedAt?.toISOString() ?? null, closedReason: row.closedReason })),
    technicians: technicians.map((row) => ({ id: row.id, name: row.name, kind: row.kind, skills: row.skills,
      channels: [row.email && "email", row.whatsapp && "whatsapp", row.telegramChatId && "telegram"].filter((value): value is string => Boolean(value)) })),
  };
}

export type RepairPanelData = Awaited<ReturnType<typeof loadRepairPanel>>;
