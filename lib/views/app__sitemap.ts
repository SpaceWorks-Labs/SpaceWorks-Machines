import { prisma } from "@/lib/db";

/** Listed, active spaces for the sitemap. Unlisted ones stay out of search engines. */
export async function loadSitemapSpaces() {
  return prisma.space.findMany({
    where: { status: "ACTIVE", visibility: "PUBLIC" },
    orderBy: { slug: "asc" },
    take: 5000,
    select: { slug: true, updatedAt: true },
  });
}
