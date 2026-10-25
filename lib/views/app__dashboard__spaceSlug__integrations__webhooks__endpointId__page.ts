import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";

/** One endpoint's delivery log (newest first). Payloads carry ids only, so they can be shown. */
export async function loadWebhookDeliveriesView({ params }: { params: Promise<{ spaceSlug: string; endpointId: string }> }) {
  const { spaceSlug, endpointId } = await params;
  const { space } = await requireSpaceCapability(spaceSlug, "integrations.manage");
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { spaceId: space.id, id: endpointId }, select: { id: true, url: true, isActive: true } });
  if (!endpoint) notFound();
  const [profile, deliveries] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, timezone: true } }),
    prisma.webhookDelivery.findMany({ where: { spaceId: space.id, endpointId: endpoint.id }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, event: true, status: true, attempts: true, responseStatus: true, lastError: true, nextAttemptAt: true, deliveredAt: true, createdAt: true, payload: true } }),
  ]);
  return { space: { ...space, ...profile }, endpoint: { ...endpoint, host: new URL(endpoint.url).host },
    deliveries: deliveries.map((row) => ({ ...row, payload: JSON.stringify(row.payload), nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
      deliveredAt: row.deliveredAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })) };
}
