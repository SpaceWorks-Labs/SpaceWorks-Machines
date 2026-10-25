import Link from "next/link";
import type { Metadata } from "next";
import { loadMachineTypeView } from "@/lib/views/app__dashboard__spaceSlug__machine-settings__types__typeSlug__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { TypeEditor } from "@/components/machine-settings/TypeEditor";
import { TypeArchiveButton } from "@/components/machine-settings/TypeArchiveButton";

export const metadata: Metadata = { title: "Machine type", robots: { index: false, follow: false } };

export default async function MachineTypePage({ params }: { params: Promise<{ spaceSlug: string; typeSlug: string }> }) {
  const { space, type, canManage, canArchive } = await loadMachineTypeView({ params });
  return <div className="flex flex-col gap-7 pb-4">
    <div><Button asChild size="sm" variant="secondary"><Link href={`/dashboard/${space.slug}/machine-settings`}>Back to machine settings</Link></Button></div>
    <SpacePageHeader space={space} title={type.name} description="Each section saves separately."
      actions={<>{type.archived ? <Chip>Archived</Chip> : null}{canArchive ? <TypeArchiveButton spaceSlug={space.slug} type={type} /> : null}</>} />
    <TypeEditor spaceSlug={space.slug} type={type} canManage={canManage} />
  </div>;
}
