import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Cog } from "lucide-react";
import { loadPublicMachinesView } from "@/lib/views/app__s__spaceSlug__machines__page";
import { machineIcon } from "@/lib/machines/icons";
import { MachineStatusChip } from "@/components/machines/MachineStatusChip";
import { MachineSpecs } from "@/components/public/MachineSpecs";
import { Card, EmptyState } from "@/components/ui/display";

type Props = { params: Promise<{ spaceSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { space } = await loadPublicMachinesView({ params });
  return {
    title: "Machines", description: `Explore machines, specifications and live status at ${space.name}.`,
    robots: { index: space.visibility === "PUBLIC", follow: space.visibility === "PUBLIC" },
  };
}

export default async function PublicMachinesPage({ params }: Props) {
  const { space, groups } = await loadPublicMachinesView({ params });
  return <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-10 px-4 py-10 sm:px-6 lg:py-16">
    <header className="flex flex-col gap-4">
      <Link href={`/s/${space.slug}`} className="inline-flex min-h-11 items-center gap-1.5 self-start text-body-ui text-accent-text underline underline-offset-4"><ArrowLeft aria-hidden className="size-4 shrink-0" />Back to {space.name}</Link>
      <h1 className="text-display-m text-ink">Machines</h1>
      <p className="text-body-l text-ink-secondary">Explore the machines at {space.name}.</p>
    </header>
    {groups.length ? groups.map(({ type, machines }) => {
      const Icon = machineIcon(type.icon);
      return <section key={type.slug} aria-labelledby={`type-${type.slug}`} className="flex flex-col gap-5">
        <h2 id={`type-${type.slug}`} className="break-words text-h2 text-ink">{type.name}</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {machines.map((machine) => <Card key={machine.slug} as="article" padding="none" className="overflow-hidden">
            <Link href={`/s/${space.slug}/machines/${machine.slug}`} className="group flex h-full flex-col focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2">
              <div className="relative flex aspect-[16/9] items-center justify-center bg-surface">
                {machine.cover ? <Image src={machine.cover.url} alt={machine.cover.alt || machine.name} fill unoptimized sizes="(min-width:1024px) 350px, (min-width:640px) 50vw, 100vw" className="object-cover" /> : <Icon aria-hidden className="size-12 text-ink-muted" />}
              </div>
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="break-words text-title text-ink group-hover:underline">{machine.name}</h3>
                  <MachineStatusChip status={machine.status} />
                </div>
                <MachineSpecs rows={machine.specs} />
              </div>
            </Link>
          </Card>)}
        </div>
      </section>;
    }) : <EmptyState icon={<Cog />} title="No public machines yet">The space has not listed any machines.</EmptyState>}
  </div>;
}
