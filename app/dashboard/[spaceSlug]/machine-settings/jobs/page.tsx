import Link from "next/link";
import type { Metadata } from "next";
import { loadJobSettingsView } from "@/lib/views/app__dashboard__spaceSlug__machine-settings__jobs__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { Button } from "@/components/ui/button";
import { JobSettingsForm } from "@/components/jobs/JobSettingsForm";

export const metadata: Metadata = { title: "Job settings", robots: { index: false, follow: false } };
export default async function JobSettingsPage(props: Parameters<typeof loadJobSettingsView>[0]) {
  const { space, settings, types } = await loadJobSettingsView(props);
  return <div className="flex flex-col gap-7 pb-4"><div><Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/machine-settings`}>Back to machine settings</Link></Button></div>
    <SpacePageHeader space={space} title="Job settings" description="Eligibility, limits, refund rules and notifications." /><JobSettingsForm spaceSlug={space.slug} settings={settings} />
    <section aria-labelledby="type-policies" className="flex flex-col gap-3"><div><h2 id="type-policies" className="text-title text-ink">Approval and machine allocation</h2><p className="mt-1 text-body-ui text-ink-secondary">Each machine type has its own approval, allocation and limit policy. Open a type and choose Queue rules.</p></div>
      {types.length ? <ul className="flex flex-wrap gap-2">{types.map((t) => <li key={t.id}><Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/machine-settings/types/${t.slug}`}>{t.name}</Link></Button></li>)}</ul> : <p className="text-body-ui text-ink-muted">No machine types yet.</p>}</section>
  </div>;
}
