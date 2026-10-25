import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { paymentSecretsConfigured } from "@/lib/payments/secrets";

/** The space's chat channels: where each posts (never its secret) and how its last delivery went. */
export async function loadSpaceNotificationsView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const access = await requireSpaceCapability(spaceSlug, "space.settings");
  const [space, channels] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: access.space.id }, select: { name: true, slug: true, logoUrl: true, timezone: true } }),
    prisma.chatChannel.findMany({
      where: { spaceId: access.space.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, kind: true, name: true, target: true, events: true, includeNames: true, enabled: true, lastDeliveredAt: true, lastError: true },
    }),
  ]);
  return { space, canEdit: true, secretsReady: paymentSecretsConfigured(), channels };
}
