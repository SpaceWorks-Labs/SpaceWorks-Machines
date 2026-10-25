import { requireSuperAdmin } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
type Props = {
  searchParams: Promise<{ q?: string; page?: string; filter?: string; }>;
};
const filters = {
  all: { label: "All", where: {} },
  unverified: { label: "Unverified email", where: { emailVerified: null } },
  "no-mfa": { label: "Without MFA", where: { mfaEnabledAt: null } },
  mfa: { label: "With MFA", where: { mfaEnabledAt: { not: null } } },
} satisfies Record<string, { label: string; where: Prisma.UserWhereInput; }>;
type FilterKey = keyof typeof filters;

export async function loadSuperAdminUsersView({ searchParams }: Props) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const filter: FilterKey = sp.filter && sp.filter in filters ? (sp.filter as FilterKey) : "all";
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const take = 50;
  const skip = page * take;
  const users = await prisma.user.findMany({
    where: {
      ...filters[filter].where,
      ...(q
        ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    skip,
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      mfaEnabledAt: true,
      isSuperAdmin: true,
      createdAt: true,
      _count: {
        select: { spaceMembers: true },
      },
    },
  });
  return { q, filter, users, page };
}
