import { isSpaceApplicationsEnabled } from "@/lib/instanceSettings";
import { SpaceStatus, type Prisma } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";

type Props = {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
};

const STATUSES = Object.values(SpaceStatus);

function parseStatus(value: string | undefined): SpaceStatus | null {
  return value && (STATUSES as string[]).includes(value) ? (value as SpaceStatus) : null;
}

export async function loadSuperAdminSpacesView({ searchParams }: Props) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = parseStatus(sp.status);
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const take = 50;
  const where: Prisma.SpaceWhereInput = {
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, { contactEmail: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [spaces, counts] = await Promise.all([
    prisma.space.findMany({
      where,
      // Waiting applications: oldest first so nothing sits at the bottom of the queue.
      orderBy: status === "PENDING_REVIEW" ? { updatedAt: "asc" } : { createdAt: "desc" },
      take,
      skip: page * take,
      select: { id: true, name: true, slug: true, status: true, source: true, city: true, createdAt: true, updatedAt: true, _count: { select: { members: true } } },
    }),
    prisma.space.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countFor = (value: SpaceStatus) => counts.find((row) => row.status === value)?._count._all ?? 0;
  const total = counts.reduce((sum, row) => sum + row._count._all, 0);
  const applicationsOpen = await isSpaceApplicationsEnabled();
  return { applicationsOpen, q, status, page, spaces, total, counts: STATUSES.map((value) => ({ status: value, count: countFor(value) })) };
}
