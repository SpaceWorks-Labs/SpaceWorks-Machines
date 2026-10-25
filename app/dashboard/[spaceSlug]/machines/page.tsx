import type { Metadata } from "next";
import { loadMachinesView } from "@/lib/views/app__dashboard__spaceSlug__machines__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { EmptyState, StatTile } from "@/components/ui/display";
import { MachineFilters } from "@/components/machines/MachineFilters";
import { MachineGroups } from "@/components/machines/MachineGroups";
import { AddMachineDialog } from "@/components/machines/AddMachineDialog";
import { MACHINE_STATUS_LABELS } from "@/components/machines/MachineStatusChip";
import { MACHINE_STATUSES } from "@/lib/machines/schemas";

type Props = { params: Promise<{ spaceSlug: string }>; searchParams: Promise<{ type?: string | string[]; status?: string | string[] }> };

export const metadata: Metadata = { title: "Machines", robots: { index: false, follow: false } };

export default async function MachinesPage(props: Props) {
  const view = await loadMachinesView(props);
  const firstMachine = view.totals.total + view.totals.retired === 0;
  return (
    <div className="flex flex-col gap-7 pb-4">
      <SpacePageHeader space={view.space} title="Machines" description="Every machine in the space, its status and what it can do."
        actions={view.canManage ? <AddMachineDialog spaceSlug={view.space.slug} currency={view.space.currency} types={view.types.filter((type) => !type.archived)} money={view.canFinance} /> : null} />
      <section aria-label="Machines at a glance" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="In service" value={view.totals.total} />
        {MACHINE_STATUSES.map((status) => <StatTile key={status} label={MACHINE_STATUS_LABELS[status]} value={view.totals.counts[status]} />)}
        <StatTile label="Retired" value={view.totals.retired} />
      </section>
      <MachineFilters types={view.types} typeId={view.typeId} status={view.status} />
      {view.machines.length ? <MachineGroups spaceSlug={view.space.slug} types={view.types} machines={view.machines} /> : (
        <EmptyState title={firstMachine ? "No machines yet" : "No machines match these filters"} patch={firstMachine} mood={firstMachine ? undefined : "sleepy"}>
          {firstMachine ? (view.canManage ? "Add your first machine to start the catalogue." : "A machine manager can add the first machine.") : "Choose another type or status to see more machines."}
        </EmptyState>
      )}
    </div>
  );
}
