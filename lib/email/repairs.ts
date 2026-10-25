import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readChannelConfig } from "@/lib/chat/notify";
import type { ChatConfig } from "@/lib/chat/config";
import { sendChatMessage } from "@/lib/chat/send";
import { asRecord, isBoundedString } from "@/lib/outboxPayload";
import { faultNumber } from "@/lib/upkeep/labels";
import { absoluteUrl, sendBrandedEmail } from "./message";

/**
 * Repair requests to technicians, built at send time. External technicians get their private link; staff a
 * link to their inbox. Messages name the machine and the fault, never the reporter or any money.
 */
type RequestPayload = { spaceId: string; requestId: string; token?: string; notice?: "taken"; kind?: "whatsapp" | "telegram" };

export function asRepairRequestPayload(value: Prisma.JsonValue, chat = false): RequestPayload | null {
  const p = asRecord(value);
  if (!p || !isBoundedString(p.spaceId, 128) || !isBoundedString(p.requestId, 128)) return null;
  if (p.token !== undefined && !(typeof p.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(p.token))) return null;
  if (p.notice !== undefined && p.notice !== "taken") return null;
  if (chat && p.kind !== "whatsapp" && p.kind !== "telegram") return null;
  return p as RequestPayload;
}

async function loadRequest(payload: RequestPayload) {
  return prisma.repairRequest.findFirst({ where: { id: payload.requestId, spaceId: payload.spaceId },
    include: { technician: true, fault: { include: { machine: { select: { name: true, space: { select: { name: true, slug: true } } } } } } } });
}

function requestText(request: NonNullable<Awaited<ReturnType<typeof loadRequest>>>, url: string) {
  const fault = request.fault;
  return {
    subject: `${fault.machine.space.name}: can you repair ${fault.machine.name}?`,
    lines: [`${fault.machine.space.name} asks you to repair ${fault.machine.name}: ${faultNumber(fault.number)} (${fault.severity.toLowerCase()}) ${fault.title}.`,
      ...(fault.description ? [fault.description.slice(0, 600)] : []),
      `Accept or decline here: ${url}`, `The request expires on ${request.expiresAt.toISOString().slice(0, 10)}.`],
  };
}

const linkFor = (request: NonNullable<Awaited<ReturnType<typeof loadRequest>>>, token?: string) =>
  absoluteUrl(token ? `/r/${token}` : `/dashboard/${request.fault.machine.space.slug}/repairs`);

export async function deliverRepairRequestEmail(payload: RequestPayload, messageId: string): Promise<"sent" | "dropped"> {
  const request = await loadRequest(payload);
  if (!request?.technician.email) return "dropped";
  if (payload.notice === "taken") {
    await sendBrandedEmail({ to: request.technician.email, messageId, spaceId: payload.spaceId, subject: `${request.fault.machine.space.name}: repair taken`,
      heading: "Someone else took this repair", paragraphs: [`${faultNumber(request.fault.number)} on ${request.fault.machine.name} was taken by another technician. Thank you for your time.`] });
    return "sent";
  }
  if (request.status !== "SENT" || request.expiresAt <= new Date()) return "dropped";
  const url = linkFor(request, payload.token);
  const { subject, lines } = requestText(request, url);
  await sendBrandedEmail({ to: request.technician.email, messageId, spaceId: payload.spaceId, subject, heading: "Repair request",
    paragraphs: lines.slice(0, -2), action: { label: "Open the request", url }, footnote: lines.at(-1) });
  return "sent";
}

/** A direct WhatsApp or Telegram message through the space's own provider, addressed to the technician. */
export async function deliverRepairRequestChat(payload: RequestPayload): Promise<"sent" | "dropped"> {
  const request = await loadRequest(payload);
  if (!request || request.status !== "SENT" || request.expiresAt <= new Date()) return "dropped";
  const kind = payload.kind === "whatsapp" ? "WHATSAPP" : "TELEGRAM";
  const target = kind === "WHATSAPP" ? request.technician.whatsapp : request.technician.telegramChatId;
  const channel = await prisma.chatChannel.findFirst({ where: { spaceId: payload.spaceId, kind, enabled: true }, orderBy: { createdAt: "asc" } });
  if (!channel || !target) return "dropped";
  const config = readChannelConfig(channel);
  const direct = kind === "WHATSAPP" ? { ...(config as ChatConfig["WHATSAPP"]), recipients: [target] } : { ...(config as ChatConfig["TELEGRAM"]), chatId: target };
  const { lines } = requestText(request, linkFor(request, payload.token));
  await sendChatMessage(kind, direct, lines.join("\n"));
  return "sent";
}
