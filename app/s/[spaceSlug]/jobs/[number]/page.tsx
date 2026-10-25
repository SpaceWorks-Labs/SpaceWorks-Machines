import type { Metadata } from "next";
import { loadRequesterJobView } from "@/lib/views/app__s__spaceSlug__jobs__number__page";
import { JobStatusChip } from "@/components/jobs/JobStatusChip";
import { JobDetailPanels } from "@/components/jobs/JobDetailPanels";
import { JobActionDialog } from "@/components/jobs/JobActionDialog";
import { PaymentBlock } from "@/components/jobs/PaymentBlock";
import { jobNumber } from "@/lib/jobs/presentation";

export const metadata: Metadata = { title: "Your job", robots: { index: false, follow: false } };
export default async function RequesterJobPage(props: Parameters<typeof loadRequesterJobView>[0]) {
  const { space, job, canCancel, canPay, canNote } = await loadRequesterJobView(props);
  return <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-4 py-10 sm:px-6"><header className="flex flex-wrap items-center gap-3"><p className="w-full text-caption text-ink-secondary">{jobNumber(job.number)}</p><h1 className="min-w-0 break-words text-h1">{job.title}</h1><JobStatusChip status={job.status} /></header>
    <div className="flex flex-wrap gap-3">{canCancel ? <JobActionDialog spaceSlug={space.slug} jobId={job.id} kind="cancel" label="Cancel job" options={{ currency: job.currency }} /> : null}
      {canNote ? <JobActionDialog spaceSlug={space.slug} jobId={job.id} kind="note" label="Add note" options={{ currency: job.currency }} /> : null}</div>
    <JobDetailPanels job={job} spaceSlug={space.slug} /><PaymentBlock spaceSlug={space.slug} payments={job.payments} canPay={canPay} />
  </div>;
}
