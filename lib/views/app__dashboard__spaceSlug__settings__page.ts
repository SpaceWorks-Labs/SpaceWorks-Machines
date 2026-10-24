import { prisma } from "@/lib/db";
import { canDeleteSpace, requireSpaceCapability } from "@/lib/permissions";

type Props = { params: Promise<{ spaceSlug: string; }>; };

/** Space settings, profile tab: machine managers only. */
export async function loadSpaceSettingsView({ params }: Props) {
  const { spaceSlug } = await params;
  const { space, membership } = await requireSpaceCapability(spaceSlug, "space.settings");
  const details = await prisma.space.findUniqueOrThrow({
    where: { id: space.id },
    select: {
      name: true, slug: true, description: true, logoUrl: true, joinPolicy: true, contactEmail: true, contactPhone: true, website: true,
      addressLine: true, city: true, region: true, postalCode: true, country: true, timezone: true, currency: true, locale: true,
    },
  });
  return { space: details, canDelete: canDeleteSpace(membership) };
}
