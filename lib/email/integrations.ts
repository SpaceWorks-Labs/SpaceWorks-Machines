import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { asRecord, isBoundedString, isEmail } from "@/lib/outboxPayload";
import { absoluteUrl, sendBrandedEmail } from "./message";

type EndpointPayload = { to: string; spaceId: string; endpointId: string };

export function asEndpointPayload(value: Prisma.JsonValue): EndpointPayload | null {
  const p = asRecord(value);
  if (!p || !isEmail(p.to) || !isBoundedString(p.spaceId, 128) || !isBoundedString(p.endpointId, 128)) return null;
  return p as EndpointPayload;
}

/** Staff alert: a webhook endpoint kept failing and was switched off. Dropped if it was switched back on. */
export async function deliverEndpointDisabled(payload: EndpointPayload, messageId: string): Promise<"sent" | "dropped"> {
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: payload.endpointId, spaceId: payload.spaceId },
    select: { url: true, isActive: true, space: { select: { name: true, slug: true } } } });
  if (!endpoint || endpoint.isActive) return "dropped";
  const host = new URL(endpoint.url).host;
  await sendBrandedEmail({ to: payload.to, messageId, subject: `${endpoint.space.name}: a webhook endpoint was switched off`,
    heading: "Webhook endpoint switched off",
    paragraphs: [`Deliveries to ${host} failed 10 times in a row, so the endpoint was switched off.`,
      "Check the endpoint, then switch it back on from Integrations. Failed deliveries can be sent again from the delivery log."],
    action: { label: "Open integrations", url: absoluteUrl(`/dashboard/${endpoint.space.slug}/integrations`) } });
  return "sent";
}
