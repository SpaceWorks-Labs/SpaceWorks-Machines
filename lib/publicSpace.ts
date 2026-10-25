import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

/** Unlisted spaces have public pages by direct link, but are never indexed. */
export function spaceShowsMachines(space: { status: string; visibility: string }) {
  return space.status === "ACTIVE" && (space.visibility === "PUBLIC" || space.visibility === "UNLISTED");
}

export const loadPublicMachineSpace = cache(async (slug: string) => {
  const space = await loadPublicSpace(slug);
  if (!spaceShowsMachines(space)) notFound();
  return { slug: space.slug, name: space.name, id: space.id, visibility: space.visibility };
});

/**
 * The space behind a public page. Active and suspended spaces have one (a suspended one says it isn't
 * taking makers); applications, refusals and archived spaces don't.
 */
export const loadPublicSpace = cache(async (slug: string, archivedJobFrame = false) => {
  const space = await prisma.space.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, name: true, description: true, logoUrl: true, accentColor: true, status: true, visibility: true, joinPolicy: true,
      city: true, region: true, country: true, website: true, contactEmail: true, contactPhone: true, locale: true,
    },
  });
  if (!space) notFound();
  if (space.status === "ARCHIVED" && archivedJobFrame) {
    // A past requester keeps the frame around their job history; archived catalogues stay hidden.
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    if (!session?.user?.id || !await prisma.job.findFirst({ where: { spaceId: space.id, requesterId: session.user.id }, select: { id: true } })) notFound();
  } else if (space.status !== "ACTIVE" && space.status !== "SUSPENDED") notFound();
  return space;
});
