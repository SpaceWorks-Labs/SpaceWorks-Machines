import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { getEmailSettings } from "@/lib/instanceSettings";
import { senderAddress } from "@/lib/email/spaceTransport";

/** The space's own email settings (never the saved password), and what is used without them. */
export async function loadSpaceEmailSettingsView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const access = await requireSpaceCapability(spaceSlug, "space.settings");
  const [space, settings, platform] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: access.space.id }, select: { name: true, slug: true, logoUrl: true, contactEmail: true } }),
    prisma.spaceEmailSettings.findUnique({ where: { spaceId: access.space.id } }),
    getEmailSettings(),
  ]);
  return {
    space,
    canEdit: true,
    platformSender: senderAddress(platform.from),
    settings: {
      enabled: settings?.enabled ?? false,
      fromName: settings?.fromName ?? "",
      fromAddress: settings?.fromAddress ?? "",
      replyTo: settings?.replyTo ?? "",
      smtpHost: settings?.smtpHost ?? "",
      smtpPort: settings?.smtpPort ?? 587,
      smtpUser: settings?.smtpUser ?? "",
      hasPassword: Boolean(settings?.smtpPasswordEncrypted),
      verifiedAt: settings?.verifiedAt ?? null,
    },
  };
}
