import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SPACE_NOTICES, type SpaceNotice } from "@/lib/spaceLifecycle";
import { absoluteUrl, sendBrandedEmail } from "./message";

type NoticePayload = { to: string; spaceId: string; notice: SpaceNotice; reason?: string };
type AdminPayload = { to: string; spaceId: string; resubmitted?: boolean };
type InvitePayload = { to: string; spaceId: string; token: string; expiresAt: string };

function record(value: Prisma.JsonValue): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;

export function asNoticePayload(value: Prisma.JsonValue): NoticePayload | null {
  const p = record(value);
  if (!p || !isText(p.to, 320) || !isText(p.spaceId, 64) || !SPACE_NOTICES.includes(p.notice as SpaceNotice)) return null;
  if (p.reason !== undefined && !isText(p.reason, 2000)) return null;
  return p as NoticePayload;
}

export function asAdminPayload(value: Prisma.JsonValue): AdminPayload | null {
  const p = record(value);
  if (!p || !isText(p.to, 320) || !isText(p.spaceId, 64)) return null;
  return p as AdminPayload;
}

export function asInvitePayload(value: Prisma.JsonValue): InvitePayload | null {
  const p = record(value);
  if (!p || !isText(p.to, 320) || !isText(p.spaceId, 64) || !isText(p.token, 256) || !isText(p.expiresAt, 64)) return null;
  return p as InvitePayload;
}

async function loadSpace(id: string) {
  return prisma.space.findUnique({ where: { id }, select: { name: true, slug: true } });
}

/** Tell a machine manager about their application or space. Returns "dropped" if the space is gone. */
export async function deliverSpaceNotice(payload: NoticePayload, messageId: string): Promise<"sent" | "dropped"> {
  const space = await loadSpace(payload.spaceId);
  if (!space) return "dropped";
  const application = absoluteUrl(`/dashboard/${space.slug}/application`);
  const dashboard = absoluteUrl(`/dashboard/${space.slug}`);
  const reason = payload.reason ? [`Note from the platform team: ${payload.reason}`] : [];
  const content = {
    received: {
      subject: `We received the application for ${space.name}`,
      heading: "Application received",
      paragraphs: [`Thanks for applying to run ${space.name} on Space Works Machines. A platform admin will review it and we will email you when there is a decision.`],
      action: { label: "View your application", url: application },
    },
    approved: {
      subject: `${space.name} is approved`,
      heading: "You're approved",
      paragraphs: [`${space.name} can now run its machines here. Start by adding your logo, inviting your team and sharing your space's page with makers.`],
      action: { label: "Open your dashboard", url: dashboard },
    },
    "changes-requested": {
      subject: `Changes needed for ${space.name}`,
      heading: "A few changes needed",
      paragraphs: [`The platform team needs a few changes before ${space.name} can be approved.`, ...reason, "Update your application and send it again."],
      action: { label: "Update your application", url: application },
    },
    rejected: {
      subject: `Your application for ${space.name}`,
      heading: "Application not approved",
      paragraphs: [`The application for ${space.name} was not approved.`, ...reason, "If you think this is a mistake, reply to the platform operator."],
      action: { label: "View your application", url: application },
    },
    suspended: {
      subject: `${space.name} is suspended`,
      heading: "Space suspended",
      paragraphs: [`${space.name} has been suspended. New makers cannot join and most changes are paused. Your records stay readable.`, ...reason],
      action: { label: "View status", url: application },
    },
    reactivated: {
      subject: `${space.name} is active again`,
      heading: "Space reactivated",
      paragraphs: [`${space.name} is active again. Everything works as before.`],
      action: { label: "Open your dashboard", url: dashboard },
    },
    created: {
      subject: `${space.name} is ready`,
      heading: "Your space is ready",
      paragraphs: [`A platform admin set up ${space.name} for you on Space Works Machines.`],
      action: { label: "Open your dashboard", url: dashboard },
    },
  }[payload.notice];
  await sendBrandedEmail({ to: payload.to, messageId, ...content });
  return "sent";
}

/** Tell a platform admin that an application is waiting. */
export async function deliverAdminApplicationAlert(payload: AdminPayload, messageId: string): Promise<"sent" | "dropped"> {
  const space = await loadSpace(payload.spaceId);
  if (!space) return "dropped";
  await sendBrandedEmail({
    to: payload.to,
    messageId,
    subject: `${payload.resubmitted ? "Updated application" : "New space application"}: ${space.name}`,
    heading: payload.resubmitted ? "An application was updated" : "A new space applied",
    paragraphs: [`${space.name} ${payload.resubmitted ? "updated its application after your requested changes" : "wants to run its machines on this platform"}. Review it to approve, ask for changes or decline.`],
    action: { label: "Review the application", url: absoluteUrl(`/super-admin/spaces/${payload.spaceId}`) },
  });
  return "sent";
}

/** Invite the person a platform admin named as machine manager of a new space. */
export async function deliverOwnerInvite(payload: InvitePayload, messageId: string): Promise<"sent" | "dropped"> {
  const space = await loadSpace(payload.spaceId);
  if (!space || new Date(payload.expiresAt) <= new Date()) return "dropped";
  await sendBrandedEmail({
    to: payload.to,
    messageId,
    subject: `You're invited to run ${space.name}`,
    heading: `Run ${space.name} on Space Works Machines`,
    paragraphs: [`A platform admin set up ${space.name} and named you as its machine manager. Accept the invite with this email address to open its dashboard and start setting up its machines.`],
    action: { label: "Accept the invite", url: absoluteUrl(`/join/space/${payload.token}`) },
    footnote: `This link works once and expires on ${new Date(payload.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Sign in or create an account with ${payload.to} to accept it.`,
  });
  return "sent";
}
