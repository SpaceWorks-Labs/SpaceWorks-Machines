import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadPublicSpace, spaceShowsMachines } from "@/lib/publicSpace";

/**
 * The public page: what the space is, how to reach it, and the visitor's own place in it (join, waiting,
 * already in), with a link to its public machine catalogue when visible.
 */
export async function loadPublicSpacePage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const space = await loadPublicSpace(spaceSlug);
  const session = await auth();
  const userId = session?.user?.id || null;
  const [membership, user] = userId
    ? await Promise.all([
      prisma.spaceMember.findUnique({ where: { userId_spaceId: { userId, spaceId: space.id } }, select: { role: true, status: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } }),
    ])
    : [null, null];
  return {
    space,
    takingMakers: space.status === "ACTIVE",
    machinesVisible: spaceShowsMachines(space),
    viewer: { signedIn: Boolean(userId), emailVerified: Boolean(user?.emailVerified), role: membership?.role ?? null, status: membership?.status ?? null },
  };
}
