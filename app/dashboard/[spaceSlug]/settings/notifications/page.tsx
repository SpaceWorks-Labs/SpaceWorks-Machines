import type { Metadata } from "next";
import { loadSpaceNotificationsView } from "@/lib/views/app__dashboard__spaceSlug__settings__notifications__page";
import { formatDate } from "@/lib/format/datetime";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { ChatChannelsPanel } from "@/components/settings/ChatChannelsPanel";

export const metadata: Metadata = { title: "Notifications", robots: { index: false, follow: false } };

export default async function SpaceNotificationsPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { space, canEdit, secretsReady, channels } = await loadSpaceNotificationsView({ params });
  return (
    <div className="flex flex-col gap-6">
      <SpacePageHeader space={space} title="Space settings" description="Where your staff hear about things that need them." />
      <SettingsTabs slug={space.slug} />
      <ChatChannelsPanel
        slug={space.slug}
        canEdit={canEdit}
        secretsReady={secretsReady}
        channels={channels.map((channel) => ({ ...channel, lastDelivered: channel.lastDeliveredAt ? formatDate(channel.lastDeliveredAt, space.timezone) : null }))}
      />
    </div>
  );
}
