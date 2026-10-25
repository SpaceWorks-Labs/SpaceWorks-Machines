import { loadSpaceSettingsView } from "@/lib/views/app__dashboard__spaceSlug__settings__page";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { EditSpaceForm } from "@/components/space/EditSpaceForm";
import { CopySpaceUrl } from "@/components/space/CopySpaceUrl";
import { DeleteSpaceButton } from "@/components/dashboard/DeleteSpaceButton";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { SpaceDetailsForm } from "@/components/settings/SpaceDetailsForm";
import { JoinPolicyForm } from "@/components/settings/JoinPolicyForm";
import { cn } from "@/lib/cn";

import type { Metadata } from "next";

type Props = { params: Promise<{ spaceSlug: string; }>; };

export const metadata: Metadata = {
  title: "Space settings",
  description: "Edit space details.",
};

const sectionCard = "rounded-xl border border-line bg-panel p-5 sm:p-6";

export default async function SpaceSettingsPage({ params }: Props) {
  const { space, canDelete } = await loadSpaceSettingsView({ params });
  return (
    <div className="flex flex-col gap-7">
      <SpacePageHeader
        space={{ name: space.name, slug: space.slug, logoUrl: space.logoUrl }}
        title="Space settings"
        description={`How ${space.name} appears to makers, how they join, and how it is reached.`}
      />
      <SettingsTabs slug={space.slug} />

      <div className="flex min-w-0 max-w-[860px] flex-col gap-6">
        <EditSpaceForm
          id="profile"
          spaceSlug={space.slug}
          initial={{
            name: space.name,
            description: space.description ?? "",
            logoUrl: space.logoUrl,
          }}
        />

        <section id="public-page" aria-labelledby="public-page-title" className={cn(sectionCard, "flex flex-col gap-4 md:flex-row md:items-center")}>
          <div className="min-w-0 flex-1">
            <h2 id="public-page-title" className="text-h4 text-ink">Public page</h2>
            <p className="mt-0.5 text-body-ui text-ink-muted">One link for makers to find and join the space. The address can&apos;t be changed.</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span title={`/s/${space.slug}`} className="max-w-full truncate rounded-full bg-muted px-3.5 py-2 tabular-nums text-sm text-ink-secondary">/s/{space.slug}</span>
            <CopySpaceUrl slug={space.slug} />
            <Link
              href={`/s/${space.slug}`}
              className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-ink-secondary underline-offset-4 hover:text-ink hover:underline"
            >
              Open
              <ExternalLink aria-hidden className="size-3.5" />
            </Link>
          </div>
        </section>

        <JoinPolicyForm spaceSlug={space.slug} initial={space.joinPolicy} />

        <SpaceDetailsForm
          spaceSlug={space.slug}
          initial={{
            contactEmail: space.contactEmail ?? "", contactPhone: space.contactPhone ?? "", website: space.website ?? "",
            addressLine: space.addressLine ?? "", city: space.city ?? "", region: space.region ?? "", postalCode: space.postalCode ?? "",
            country: space.country, timezone: space.timezone, currency: space.currency, locale: space.locale ?? "",
          }}
        />

        {canDelete ? (
          <section
            id="danger-zone"
            aria-labelledby="danger-zone-title"
            className={cn(sectionCard, "flex flex-col gap-4 border-[1.5px] border-danger-border md:flex-row md:items-center")}
          >
            <div className="min-w-0 flex-1">
              <h2 id="danger-zone-title" className="text-h4 text-danger-fg">Delete space</h2>
              <p className="mt-0.5 text-body-ui text-ink-secondary">
                Permanently removes {space.name} with its team, makers and settings. You&apos;ll be asked to type the name to confirm.
              </p>
            </div>
            <div className="shrink-0">
              <DeleteSpaceButton spaceSlug={space.slug} spaceName={space.name} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
