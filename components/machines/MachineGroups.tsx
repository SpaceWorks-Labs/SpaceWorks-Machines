import Image from "next/image";
import Link from "next/link";
import { Card, Chip, SectionHeading } from "@/components/ui/display";
import { machineIcon } from "@/lib/machines/icons";
import type { MachineCard } from "@/lib/machines/queries";
import { MachineStatusChip } from "./MachineStatusChip";

export function MachineGroups({ spaceSlug, types, machines }: {
  spaceSlug: string; types: { id: string; name: string; icon: string; archived: boolean }[]; machines: MachineCard[];
}) {
  return types.map((type) => {
    const rows = machines.filter((machine) => machine.typeId === type.id);
    if (!rows.length) return null;
    const Icon = machineIcon(type.icon);
    return (
      <section key={type.id} className="flex flex-col gap-4" aria-label={type.name}>
        <SectionHeading title={type.name} description={`${rows.length} ${rows.length === 1 ? "machine" : "machines"}${type.archived ? " · Archived type" : ""}`} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((machine) => (
            <Card key={machine.id} as="article" padding="none" className="overflow-hidden">
              <Link href={`/dashboard/${spaceSlug}/machines/${machine.slug}`} className="group flex h-full flex-col focus-visible:outline-2 focus-visible:outline-[rgb(var(--sw-ui-focus))] focus-visible:-outline-offset-2">
                <div className="relative flex aspect-[16/9] items-center justify-center bg-surface">
                  {machine.coverUrl ? <Image src={machine.coverUrl} alt={machine.coverAlt} fill unoptimized sizes="(min-width:1280px) 340px, (min-width:640px) 50vw, 100vw" className="object-cover" /> : <Icon aria-hidden className="size-12 text-ink-muted" />}
                </div>
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 break-words text-title text-ink group-hover:underline">{machine.name}</h3>
                    <MachineStatusChip status={machine.status} retired={machine.retired} />
                  </div>
                  <p className="break-words text-body-ui text-ink-secondary">{machine.location || "No location set"}</p>
                  <div className="mt-auto flex flex-wrap gap-2"><Chip tone="outline">{machine.isPublic ? "Public" : "Staff only"}</Chip><Chip tone="outline">{machine.acceptsJobs ? "Accepts jobs" : "Jobs closed"}</Chip></div>
                </div>
              </Link>
            </Card>
          ))}
        </div>
      </section>
    );
  });
}
