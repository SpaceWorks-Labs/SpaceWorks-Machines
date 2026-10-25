import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { FaultReport, Prisma, RepairRequest, Technician } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { queueChatAlerts } from "@/lib/chat/notify";
import { enqueueOutbox } from "@/lib/outbox";
import { actorMayUseMachine } from "@/lib/typeScope";

/**
 * Repair requests (owner decision 2026-10-24): the manager picks technicians from the directory and asks
 * them to take a fault. Each one hears on every channel they have (email always; WhatsApp or Telegram when
 * the space has that provider set up; staff also get an inbox item; external technicians a private link).
 * The first to accept is assigned and every other open request closes.
 */
export class RepairError extends Error {}
export class RepairNotFoundError extends Error {
  constructor() { super("Space not found."); }
}

export const REQUEST_EXPIRY_DAYS = 14;
const CLOSED_FAULT = ["RESOLVED", "WONT_FIX"];
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Row-lock a fault of this space; with a staff actor, a machine type manager outside its type gets not-found. */
export async function lockFault(tx: Prisma.TransactionClient, spaceId: string, faultId: string, actorId?: string | null): Promise<FaultReport> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FaultReport" WHERE "spaceId" = ${spaceId} AND "id" = ${faultId} FOR UPDATE`;
  if (!rows[0]) throw new RepairNotFoundError();
  const fault = await tx.faultReport.findUniqueOrThrow({ where: { spaceId_id: { spaceId, id: faultId } } });
  if (actorId !== undefined && !(await actorMayUseMachine(tx, spaceId, actorId, fault.machineId))) throw new RepairNotFoundError();
  return fault;
}

async function chatProviders(tx: Prisma.TransactionClient, spaceId: string) {
  const channels = await tx.chatChannel.findMany({ where: { spaceId, enabled: true, kind: { in: ["WHATSAPP", "TELEGRAM"] } }, select: { kind: true } });
  return new Set(channels.map((channel) => channel.kind));
}

/** Ask technicians to take a fault. Technicians with an open request for it are skipped. */
export async function sendRepairRequests(tx: Prisma.TransactionClient, actor: { spaceId: string; actorId: string }, input: { faultId: string; technicianIds: string[] }) {
  const fault = await lockFault(tx, actor.spaceId, input.faultId, actor.actorId);
  if (CLOSED_FAULT.includes(fault.status)) throw new RepairError("This fault is closed.");
  if (fault.technicianId) throw new RepairError("A technician already took this repair.");
  const ids = [...new Set(input.technicianIds)].slice(0, 30);
  const technicians = await tx.technician.findMany({ where: { spaceId: actor.spaceId, id: { in: ids }, isActive: true } });
  if (!ids.length || technicians.length !== ids.length) throw new RepairError("Pick active technicians from the directory.");
  const settings = await tx.spaceJobSettings.findUnique({ where: { spaceId: actor.spaceId }, select: { repairRequestExpiryDays: true } });
  const expiresAt = new Date(Date.now() + (settings?.repairRequestExpiryDays ?? REQUEST_EXPIRY_DAYS) * 86_400_000);
  const providers = await chatProviders(tx, actor.spaceId);
  const sent: RepairRequest[] = [];
  for (const technician of technicians) {
    if (await tx.repairRequest.findFirst({ where: { spaceId: actor.spaceId, faultId: fault.id, technicianId: technician.id, status: "SENT", expiresAt: { gt: new Date() } } })) continue;
    const token = technician.kind === "EXTERNAL" ? randomBytes(32).toString("base64url") : null;
    const channels = [...(technician.email ? ["email"] : []), ...(technician.kind === "STAFF" ? ["inbox"] : []),
      ...(technician.whatsapp && providers.has("WHATSAPP") ? ["whatsapp"] : []), ...(technician.telegramChatId && providers.has("TELEGRAM") ? ["telegram"] : [])];
    const request = await tx.repairRequest.create({ data: { spaceId: actor.spaceId, faultId: fault.id, technicianId: technician.id, channels,
      tokenHash: token ? hashToken(token) : null, expiresAt, sentById: actor.actorId } });
    // The link token travels only inside these bearer messages (deleted once sent).
    if (channels.includes("email")) await enqueueOutbox(tx, "repair-request", { spaceId: actor.spaceId, requestId: request.id, ...(token ? { token } : {}) });
    for (const kind of ["whatsapp", "telegram"] as const) {
      if (channels.includes(kind)) await enqueueOutbox(tx, "repair-request-chat", { spaceId: actor.spaceId, requestId: request.id, kind, ...(token ? { token } : {}) });
    }
    sent.push(request);
  }
  if (sent.length) {
    await recordAuditEvent({ action: "repair.requested", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "FaultReport", targetId: fault.id,
      metadata: { technicians: sent.length }, client: tx });
  }
  return sent;
}

/** Give the fault to one technician and close every other open request for it (they're told it's taken). */
async function assign(tx: Prisma.TransactionClient, fault: FaultReport, technician: Technician, actorId: string | null) {
  await tx.faultReport.update({ where: { id: fault.id }, data: { technicianId: technician.id, assignedToId: technician.userId ?? fault.assignedToId,
    status: fault.status === "OPEN" ? "ACKNOWLEDGED" : fault.status } });
  const others = await tx.repairRequest.findMany({ where: { spaceId: fault.spaceId, faultId: fault.id, status: "SENT", technicianId: { not: technician.id } } });
  await tx.repairRequest.updateMany({ where: { id: { in: others.map((row) => row.id) } }, data: { status: "CLOSED", closedReason: "Another technician took it." } });
  for (const other of others) await enqueueOutbox(tx, "repair-request", { spaceId: fault.spaceId, requestId: other.id, notice: "taken" });
  await queueChatAlerts(tx, fault.spaceId, "fault-assigned", { faultId: fault.id, machineId: fault.machineId });
  await recordAuditEvent({ action: "repair.assigned", actorUserId: actorId, spaceId: fault.spaceId, targetType: "FaultReport", targetId: fault.id,
    metadata: { technicianKind: technician.kind }, client: tx });
}

/** The manager assigns a technician directly, with or without asking first. */
export async function assignTechnician(tx: Prisma.TransactionClient, actor: { spaceId: string; actorId: string }, input: { faultId: string; technicianId: string }) {
  const fault = await lockFault(tx, actor.spaceId, input.faultId, actor.actorId);
  if (CLOSED_FAULT.includes(fault.status)) throw new RepairError("This fault is closed.");
  if (fault.technicianId) throw new RepairError("A technician already took this repair.");
  const technician = await tx.technician.findFirst({ where: { spaceId: actor.spaceId, id: input.technicianId, isActive: true } });
  if (!technician) throw new RepairError("Pick an active technician from the directory.");
  await tx.repairRequest.updateMany({ where: { spaceId: actor.spaceId, faultId: fault.id, technicianId: technician.id, status: "SENT" }, data: { status: "ACCEPTED", respondedAt: new Date() } });
  await assign(tx, fault, technician, actor.actorId);
}

/**
 * A technician answers a request. Accepting under the fault's row lock means two technicians accepting at once
 * can't both win: the second finds the repair taken. Expired requests can't be answered. An expired or taken
 * request is marked as such and reported in the outcome (not thrown, so the mark is kept).
 */
export type AnswerOutcome = "accepted" | "declined" | "expired" | "taken";
export const ANSWER_ERRORS: Partial<Record<AnswerOutcome, string>> = { expired: "This request has expired.", taken: "Another technician already took this repair." };

export async function answerRepairRequest(tx: Prisma.TransactionClient, input: { spaceId: string; requestId: string; technicianId: string; accept: boolean; actorId?: string | null }) {
  const request = await tx.repairRequest.findFirst({ where: { spaceId: input.spaceId, id: input.requestId, technicianId: input.technicianId } });
  if (!request) throw new RepairNotFoundError();
  const fault = await lockFault(tx, input.spaceId, request.faultId);
  const current = await tx.repairRequest.findUniqueOrThrow({ where: { id: request.id } });
  if (current.status === "CLOSED") return { outcome: "taken" as AnswerOutcome };
  if (current.status !== "SENT") throw new RepairError("This request was already answered.");
  if (current.expiresAt <= new Date()) {
    await tx.repairRequest.update({ where: { id: current.id }, data: { status: "EXPIRED" } });
    return { outcome: "expired" as AnswerOutcome };
  }
  if (!input.accept) {
    await tx.repairRequest.update({ where: { id: current.id }, data: { status: "DECLINED", respondedAt: new Date() } });
    return { outcome: "declined" as AnswerOutcome };
  }
  if (fault.technicianId || CLOSED_FAULT.includes(fault.status)) {
    await tx.repairRequest.update({ where: { id: current.id }, data: { status: "CLOSED", closedReason: "Another technician took it." } });
    return { outcome: "taken" as AnswerOutcome };
  }
  await tx.repairRequest.update({ where: { id: current.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
  const technician = await tx.technician.findUniqueOrThrow({ where: { id: input.technicianId } });
  await assign(tx, fault, technician, input.actorId ?? technician.userId);
  return { outcome: "accepted" as AnswerOutcome };
}

/** An external technician's link: the request it opens, while it is live (not expired, not closed). */
export async function requestForToken(client: Prisma.TransactionClient, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const request = await client.repairRequest.findUnique({ where: { tokenHash: hashToken(token) },
    include: { technician: true, fault: { include: { machine: { select: { name: true, space: { select: { name: true, slug: true, currency: true, status: true } } } } } } } });
  if (!request || request.expiresAt <= new Date() || ["DECLINED", "EXPIRED", "CLOSED"].includes(request.status)) return null;
  if (request.status === "ACCEPTED" && request.fault.technicianId !== request.technicianId) return null;
  if (CLOSED_FAULT.includes(request.fault.status) || request.fault.machine.space.status !== "ACTIVE") return null;
  return request;
}

/** Close a fault's links when it is closed. */
export async function closeRequestsForFault(tx: Prisma.TransactionClient, spaceId: string, faultId: string) {
  await tx.repairRequest.updateMany({ where: { spaceId, faultId, status: "SENT" }, data: { status: "CLOSED", closedReason: "The fault was closed." } });
}
