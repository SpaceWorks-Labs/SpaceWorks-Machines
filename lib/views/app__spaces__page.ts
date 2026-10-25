import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 24;

/** Public, active spaces makers can find and join. Unlisted ones never appear here. */
export async function loadSpacesDirectory({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const search = await searchParams;
  const q = (search.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(500, Number.parseInt(search.page ?? "1", 10) || 1));
  const where: Prisma.SpaceWhereInput = {
    status: "ACTIVE",
    visibility: "PUBLIC",
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { region: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, spaces] = await Promise.all([
    prisma.space.count({ where }),
    prisma.space.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { slug: true, name: true, city: true, region: true, country: true, description: true, logoUrl: true, joinPolicy: true },
    }),
  ]);
  return { q, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, spaces };
}
