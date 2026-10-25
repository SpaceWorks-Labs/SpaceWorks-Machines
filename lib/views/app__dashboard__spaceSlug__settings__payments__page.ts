import { prisma } from "@/lib/db";
import { can, requireSpaceCapability } from "@/lib/permissions";
import { getRequestOrigin } from "@/lib/publicUrl";
import { ensurePaymentSettings, webhookPath } from "@/lib/payments/config";
import { paymentSecretsConfigured } from "@/lib/payments/secrets";
import { JOB_DEFAULTS } from "@/lib/jobs/settingsDefaults";
import { moneySettingsSchema } from "@/lib/jobs/settingsSchemas";

/** Gateway and offline payment settings. Secrets never leave the server; only whether one is saved. */
export async function loadPaymentSettingsView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const { space, membership } = await requireSpaceCapability(spaceSlug, "payments.view");
  const [details, settings, origin] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { name: true, slug: true, logoUrl: true, currency: true, offlineConfirmationRequired: true } }),
    ensurePaymentSettings(space.id),
    getRequestOrigin(),
  ]);
  const canEdit = can(membership.role, "payments.settings");
  return {
    space: details,
    canEdit,
    secretsReady: paymentSecretsConfigured(),
    jobPolicy: moneySettingsSchema.parse(await prisma.spaceJobSettings.findUnique({ where: { spaceId: space.id } }) ?? JOB_DEFAULTS),
    gateway: {
      provider: settings.provider,
      keyId: settings.keyId,
      hasSecret: Boolean(settings.secretEncrypted),
      hasWebhookSecret: Boolean(settings.webhookSecretEncrypted),
      testMode: settings.testMode,
      verifiedAt: settings.verifiedAt,
      webhookUrls: canEdit ? { RAZORPAY: `${origin}${webhookPath("RAZORPAY", settings.webhookPublicCode)}`, STRIPE: `${origin}${webhookPath("STRIPE", settings.webhookPublicCode)}` } : null,
    },
    offline: { upiVpa: settings.upiVpa ?? "", upiPayeeName: settings.upiPayeeName ?? "", offlineInstructions: settings.offlineInstructions, offlineConfirmationRequired: details.offlineConfirmationRequired },
  };
}
