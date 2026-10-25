import "server-only";

import { prisma } from "@/lib/db";
import { can, requireSpaceCapability } from "@/lib/permissions";
import type { Capability } from "@/lib/permissionRoles";

/**
 * Shared loader for dashboard areas that later phases fill (machines, jobs, upkeep, integrations). The route,
 * its capability gate and its place in the navigation are real now; only the content waits. `capabilities`
 * opens the page to anyone holding one of them.
 */
export async function loadComingSoonView(params: Promise<{ spaceSlug: string }>, capabilities: [Capability, ...Capability[]]) {
  const { spaceSlug } = await params;
  const probe = await requireSpaceCapability(spaceSlug, "space.view");
  const allowed = capabilities.find((capability) => can(probe.membership.role, capability)) ?? capabilities[0];
  const { space, membership } = await requireSpaceCapability(spaceSlug, allowed);
  const details = await prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { name: true, slug: true, logoUrl: true } });
  return { space: details, role: membership.role };
}
