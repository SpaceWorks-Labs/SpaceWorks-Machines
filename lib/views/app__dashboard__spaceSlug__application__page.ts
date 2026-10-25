import { prisma } from "@/lib/db";
import { can, requireSpaceTeam } from "@/lib/permissions";
import { canResubmit } from "@/lib/spaceLifecycle";

/** The space's application and lifecycle, for its own team, whatever its status. */
export async function loadSpaceApplicationView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const { space, membership } = await requireSpaceTeam(spaceSlug);
  const [details, reviews] = await Promise.all([
    prisma.space.findUniqueOrThrow({
      where: { id: space.id },
      select: {
        name: true, slug: true, status: true, description: true, contactEmail: true, contactPhone: true,
        website: true, addressLine: true, city: true, region: true, postalCode: true, country: true, createdAt: true,
      },
    }),
    prisma.spaceReview.findMany({
      where: { spaceId: space.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      // Platform admins are not named to applicants: the history says what happened, not who.
      select: { id: true, action: true, reason: true, createdAt: true },
    }),
  ]);
  const latestNote = reviews.find((review) => review.reason)?.reason ?? null;
  return {
    space: details,
    reviews,
    latestNote,
    canEdit: can(membership.role, "space.settings") && canResubmit(details.status),
    isManager: can(membership.role, "space.settings"),
  };
}
