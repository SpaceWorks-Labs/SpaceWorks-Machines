import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminOverviewView } from "@/lib/views/app__super-admin__page";
import Link from "next/link";
import { SparklineCard } from "@/components/super-admin/Sparkline";
import { AdminPanel, MetricRows, NameCell } from "@/components/super-admin/AdminPanel";
import { SpaceStatusChip } from "@/components/space/SpaceStatusChip";
import { PageHeader, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TR } from "@/components/ui/table";

export default async function SuperAdminOverviewPage() {
  await requireSuperAdmin();
  const { stats, attention, activity7d, recentSpaces } = await loadSuperAdminOverviewView();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" description="The platform at a glance: spaces, people and the signals that need you." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <StatTile key={stat.label} className="rounded-xl" label={stat.label} value={stat.value.toLocaleString("en-IN")} />
        ))}
      </div>

      <AdminPanel title="Needs attention" description="Each signal links to the page with details.">
        <MetricRows
          rows={attention.map((item) => ({
            label: <Link href={item.href} className="underline-offset-4 hover:text-ink hover:underline">{item.label}</Link>,
            value: <span className={item.value > 0 ? "inline-flex min-w-7 justify-center rounded-full bg-highlight px-2 text-on-highlight" : "text-ink-muted"}>{item.value.toLocaleString("en-IN")}</span>,
          }))}
        />
      </AdminPanel>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SparklineCard title="Spaces (7 days)" subtitle="Created per day" points={activity7d.map((d) => ({ xLabel: d.day, y: d.spaces }))} />
        <SparklineCard title="Users (7 days)" subtitle="Signed up per day" points={activity7d.map((d) => ({ xLabel: d.day, y: d.users }))} />
      </div>

      <AdminPanel title="Recent spaces">
        <Table label="Recent spaces">
          <TBody>
            {recentSpaces.map((o) => (
              <TR key={o.id}>
                <TD><NameCell href={`/super-admin/spaces/${o.id}`} name={o.name} sub={`/s/${o.slug} · ${o._count.members} people`} /></TD>
                <TD><SpaceStatusChip status={o.status} /></TD>
                <TD className="text-right text-ink-secondary">{o.createdAt.toLocaleDateString("en-GB")}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </AdminPanel>
    </div>
  );
}
