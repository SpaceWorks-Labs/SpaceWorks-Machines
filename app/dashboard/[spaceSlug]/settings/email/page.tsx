import type { Metadata } from "next";
import { loadSpaceEmailSettingsView } from "@/lib/views/app__dashboard__spaceSlug__settings__email__page";
import { formatDate } from "@/lib/format/datetime";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { SpaceEmailForm } from "@/components/settings/SpaceEmailForm";
import { Card, CardHeader } from "@/components/ui/display";

export const metadata: Metadata = { title: "Email", robots: { index: false, follow: false } };

export default async function SpaceEmailSettingsPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { space, canEdit, platformSender, settings } = await loadSpaceEmailSettingsView({ params });
  const { verifiedAt, ...initial } = settings;
  return (
    <div className="flex flex-col gap-6">
      <SpacePageHeader space={space} title="Space settings" description="How emails to your makers are sent." />
      <SettingsTabs slug={space.slug} />
      <Card as="section" className="max-w-[860px] rounded-xl">
        <CardHeader
          title="Your own email"
          description={`Emails to makers (invites, join decisions, job updates and receipts) can go out from your own address. Without it they come from ${platformSender} in ${space.name}'s name${space.contactEmail ? `, with replies to ${space.contactEmail}` : ""}. Sign-in emails such as password resets always come from the platform.`}
        />
        <SpaceEmailForm slug={space.slug} canEdit={canEdit} initial={initial} verified={verifiedAt ? formatDate(verifiedAt, "UTC") : null} />
      </Card>
    </div>
  );
}
