import type { Metadata } from "next";
import { loadPaymentSettingsView } from "@/lib/views/app__dashboard__spaceSlug__settings__payments__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { GatewaySettingsForm } from "@/components/settings/payments/GatewaySettingsForm";
import { OfflinePaymentsForm } from "@/components/settings/payments/OfflinePaymentsForm";
import { Card, CardHeader } from "@/components/ui/display";
import { JobMoneySettingsForm } from "@/components/jobs/JobMoneySettingsForm";

export const metadata: Metadata = { title: "Payments", robots: { index: false, follow: false } };

const dateLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function PaymentSettingsPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { space, canEdit, secretsReady, gateway, offline, jobPolicy } = await loadPaymentSettingsView({ params });
  return (
    <div className="flex flex-col gap-6">
      <SpacePageHeader space={space} title="Space settings" description="How makers pay for their jobs. Money goes straight to the space." />
      <SettingsTabs slug={space.slug} />
      <Card as="section" className="max-w-[860px] rounded-xl"><CardHeader title="Job payment policy" description="Paid jobs, payment timing, methods and tax." /><JobMoneySettingsForm spaceSlug={space.slug} initial={jobPolicy} canEdit={canEdit} /></Card>
      <Card as="section" className="max-w-[860px] rounded-xl">
        <CardHeader title="Online payments" description="Makers pay through your own Razorpay or Stripe account. Money goes straight to you." />
        <GatewaySettingsForm slug={space.slug} canEdit={canEdit} secretsReady={secretsReady} initial={{ ...gateway, verifiedAt: gateway.verifiedAt ? dateLabel.format(gateway.verifiedAt) : null }} />
      </Card>
      <Card as="section" className="max-w-[860px] rounded-xl">
        <CardHeader title="Paying directly" description="UPI, bank transfer or cash, recorded by your staff." />
        <OfflinePaymentsForm slug={space.slug} canEdit={canEdit} initial={offline} />
      </Card>
    </div>
  );
}
