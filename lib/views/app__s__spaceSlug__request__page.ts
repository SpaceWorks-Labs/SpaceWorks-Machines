import { requireAuth } from "@/lib/permissions";
import { loadPublicMachineSpace } from "@/lib/publicSpace";
import { prisma } from "@/lib/db";
import { intakeOptions } from "@/lib/jobs/intake";

export async function loadJobRequestView({ params, searchParams }: { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ type?: string; machine?: string }> }) {
  await requireAuth();
  const space = await loadPublicMachineSpace((await params).spaceSlug);
  const [profile, intake] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { currency: true } }), intakeOptions(space.id),
  ]);
  return { space: { ...space, ...profile }, intake, initial: await searchParams };
}
