import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { absoluteUrl, sendBrandedEmail } from "./message";

export const MEMBER_NOTICES = ["approved", "declined", "invited"] as const;
export type MemberNotice = (typeof MEMBER_NOTICES)[number];
type MemberNoticePayload = { to: string; spaceId: string; notice: MemberNotice; token?: string; expiresAt?: string };

export function asMemberNoticePayload(value: Prisma.JsonValue): MemberNoticePayload | null {
  const p = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!p || typeof p.to !== "string" || p.to.length > 320 || typeof p.spaceId !== "string" || !MEMBER_NOTICES.includes(p.notice as MemberNotice)) return null;
  if (p.notice === "invited" && (typeof p.token !== "string" || p.token.length > 256 || typeof p.expiresAt !== "string")) return null;
  return p as MemberNoticePayload;
}

/** Maker-facing notices, sent in the space's name through its own SMTP when it has one. */
export async function deliverMemberNotice(payload: MemberNoticePayload, messageId: string): Promise<"sent" | "dropped"> {
  const space = await prisma.space.findUnique({ where: { id: payload.spaceId }, select: { name: true, slug: true } });
  if (!space) return "dropped";
  if (payload.notice === "invited") {
    if (new Date(payload.expiresAt!) <= new Date()) return "dropped";
    await sendBrandedEmail({
      to: payload.to, messageId, spaceId: payload.spaceId,
      subject: `You're invited to ${space.name}`,
      heading: `Join ${space.name}`,
      paragraphs: [`${space.name} invited you to join it on Space Works Machines. Accept with this email address to get started.`],
      action: { label: "Accept the invite", url: absoluteUrl(`/join/space/${payload.token}`) },
      footnote: `This link works once and expires on ${new Date(payload.expiresAt!).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`,
    });
    return "sent";
  }
  const approved = payload.notice === "approved";
  await sendBrandedEmail({
    to: payload.to, messageId, spaceId: payload.spaceId,
    subject: approved ? `You're in: ${space.name}` : `Your request to join ${space.name}`,
    heading: approved ? `Welcome to ${space.name}` : "Request not approved",
    paragraphs: [approved ? `${space.name} approved your request to join.` : `${space.name} didn't approve your request to join this time. Ask the space directly if you think this is a mistake.`],
    action: { label: approved ? "Open the space" : "See the space", url: absoluteUrl(`/s/${space.slug}`) },
  });
  return "sent";
}
