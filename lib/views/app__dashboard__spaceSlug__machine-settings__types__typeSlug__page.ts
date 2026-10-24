import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { can, spaceAllows } from "@/lib/permissionRoles";
import { loadFullType } from "@/lib/machines/queries";
import { inScope } from "@/lib/typeScope";

export async function loadMachineTypeView({ params }: { params: Promise<{ spaceSlug: string; typeSlug: string }> }) {
  const { spaceSlug, typeSlug } = await params;
  const { space, membership, typeScope } = await requireSpaceCapability(spaceSlug, "machines.view");
  const type = await loadFullType(space.id, { slug: typeSlug });
  if (!type || !inScope(typeScope, type.id)) notFound();
  const profile = await prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true } });
  return { space: { ...space, ...profile }, type,
    // Archiving is space-wide (machine managers); editing the type is type.settings (also its type managers).
    canArchive: can(membership.role, "machine.settings") && spaceAllows(space.status, "machine.settings"),
    canManage: can(membership.role, "type.settings") && spaceAllows(space.status, "type.settings") };
}
