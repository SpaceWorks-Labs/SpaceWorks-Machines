import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { JOB_DEFAULTS } from "@/lib/jobs/settingsDefaults";
import { jobSettingsSchema } from "@/lib/jobs/settingsSchemas";

export async function loadJobSettingsView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { space } = await requireSpaceCapability((await params).spaceSlug, "machine.settings");
  const [profile, stored, types] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true } }),
    prisma.spaceJobSettings.findUnique({ where: { spaceId: space.id } }),
    prisma.machineType.findMany({ where: { spaceId: space.id }, select: { id: true, slug: true, name: true, requiresApproval: true, allocationPolicy: true } }),
  ]);
  return { space: { ...space, ...profile }, settings: jobSettingsSchema.parse(stored ?? JOB_DEFAULTS), types };
}
