import "server-only";

import type { SpaceStatus, SpaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";

export type ShellSpace = {
  slug: string;
  name: string;
  logoUrl: string | null;
  role: SpaceRole;
  status: SpaceStatus;
};

export type ShellUser = {
  name: string | null;
  email: string | null;
  image: string | null;
};

const MAX_SHELL_SPACES = 50;

/** Data for the dashboard sidebar: the signed-in person and the spaces where they are active staff. */
export async function getAppShellData(userId: string): Promise<{ user: ShellUser; spaces: ShellSpace[] }> {
  const [user, teams] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, image: true, profileImageUrl: true } }),
    prisma.spaceMember.findMany({
      where: { userId, status: "ACTIVE", role: { not: "MEMBER" } },
      select: { role: true, space: { select: { slug: true, name: true, logoUrl: true, status: true } } },
      orderBy: { space: { name: "asc" } },
      take: MAX_SHELL_SPACES,
    }),
  ]);

  return {
    user: { name: user?.name ?? null, email: user?.email ?? null, image: user?.profileImageUrl ?? user?.image ?? null },
    spaces: teams.map(({ role, space }) => ({ ...space, role })),
  };
}
