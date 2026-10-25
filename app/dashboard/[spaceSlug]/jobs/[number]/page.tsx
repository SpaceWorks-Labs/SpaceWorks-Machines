import type { Metadata } from "next";
import { loadStaffJobView } from "@/lib/views/app__dashboard__spaceSlug__jobs__number__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { JobStatusChip } from "@/components/jobs/JobStatusChip";
import { JobDetailPanels } from "@/components/jobs/JobDetailPanels";
import { StaffJobActions } from "@/components/jobs/StaffJobActions";
import { PaymentBlock } from "@/components/jobs/PaymentBlock";
import { jobNumber } from "@/lib/jobs/presentation";
import { LayerTicker } from "@/components/eggs/LayerTicker";

export const metadata: Metadata = { title: "Job", robots: { index: false, follow: false } };
export default async function StaffJobPage(props: Parameters<typeof loadStaffJobView>[0]) {
  const view = await loadStaffJobView(props);
  const { job, space } = view;
  return <div className="flex max-w-[960px] flex-col gap-6"><SpacePageHeader space={space} title={`${jobNumber(job.number)} · ${job.title}`} description={`Requested by ${view.requester.name || view.requester.email || "a maker"}${view.requester.name && view.requester.email ? ` · ${view.requester.email}` : ""}`} /><div className="flex flex-wrap items-end justify-between gap-4"><JobStatusChip status={job.status} />{job.status === "COMPLETED" || job.status === "COLLECTED" ? <LayerTicker /> : null}</div>
    <StaffJobActions job={job} spaceSlug={space.slug} canReview={view.canReview} canOperate={view.canOperate} options={{ currency: job.currency, canMoney: view.canManagePayments, machines: view.machines, pools: view.pools, estimatedMinutes: job.estimatedMinutes, estimatedQuantity: job.estimatedQuantity, machineId: job.assignedMachineId ?? job.machineId }} />
    <JobDetailPanels job={job} spaceSlug={space.slug} showPrice={view.canMoney} />
    {view.canMoney ? <PaymentBlock payments={job.payments} spaceSlug={space.slug} manage={view.canManagePayments} methods={view.offlineMethods} userId={view.userId} /> : null}
  </div>;
}
