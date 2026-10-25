import { requireSpaceTeam } from "@/lib/permissions";

export async function loadSpaceSlugShell({
  params,
}: {

  params: Promise<{ spaceSlug: string; }>;
}) {
  const { spaceSlug } = await params;
  // Any status: the application page lives under this layout. Each page applies its own gate.
  const { space } = await requireSpaceTeam(spaceSlug);
  return { space };
}
