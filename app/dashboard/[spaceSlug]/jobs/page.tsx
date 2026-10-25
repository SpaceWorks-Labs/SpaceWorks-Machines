import Link from "next/link";
import type { Metadata } from "next";
import { loadJobsView } from "@/lib/views/app__dashboard__spaceSlug__jobs__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { EmptyState, Card, Chip } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { JobStatusChip } from "@/components/jobs/JobStatusChip";
import { STATUS_LABELS, jobNumber, words } from "@/lib/jobs/presentation";
import { JobFilters } from "@/components/jobs/JobFilters";
import { CreateJobDialog } from "@/components/jobs/CreateJobDialog";

/** The board holds work still in the workshop; finished-with jobs fold away below it, since that list only grows. */
const OPEN = ["SUBMITTED", "APPROVED", "RUNNING", "PAUSED", "COMPLETED"] as const;
const CLOSED = ["COLLECTED", "REJECTED", "FAILED", "CANCELLED"] as const;

export const metadata: Metadata = { title: "Jobs", robots: { index: false, follow: false } };
export default async function JobsPage(props: Parameters<typeof loadJobsView>[0]) {
  const view = await loadJobsView(props);
  const href = (number: number) => `/dashboard/${view.space.slug}/jobs/${number}`;
  const filtered = Object.values(view.filters).some(Boolean);
  const closed = view.jobs.filter((j) => (CLOSED as readonly string[]).includes(j.status));
  return <div className="flex flex-col gap-7"><SpacePageHeader space={view.space} title="Jobs" description="Review requests, run machines and hand finished jobs back to their makers."
    actions={view.intake ? <CreateJobDialog space={view.space} intake={view.intake} /> : null} />
    <JobFilters types={view.types} machines={view.machines} filters={view.filters} />
    {view.jobs.length ? <>
      <div aria-label="Jobs board" role="region" className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{OPEN.map((status) => {
        const jobs = view.jobs.filter((j) => j.status === status);
        return <section key={status} aria-label={STATUS_LABELS[status]} className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-3">
          <h2 className="flex items-center justify-between gap-2 px-1 text-title">{STATUS_LABELS[status]} <span className="rounded-full border border-line bg-panel px-2 text-caption font-semibold text-ink-secondary">{jobs.length}</span></h2>
          {jobs.length ? jobs.map((j) => <Card key={j.id} padding="sm" className="min-w-0"><Link className="break-words text-label text-accent-text underline underline-offset-4" href={href(j.number)}>{jobNumber(j.number)} · {j.title}</Link>
            <p className="mt-2 truncate text-body-ui text-ink-secondary" title={j.requester.name || j.requester.email || undefined}>{j.requester.name || j.requester.email}</p><p className="break-words text-caption text-ink-secondary">{j.type.name}{j.assignedMachine ? ` · ${j.assignedMachine.name}` : ""}</p><div className="mt-2"><Chip size="sm">{words(j.paymentState)}</Chip></div></Card>)
            : <p className="px-1 pb-1 text-caption text-ink-muted">No jobs</p>}
        </section>;
      })}</div>
      <CollapsibleSection id="jobs-closed" title="Closed jobs" description="Collected, rejected, failed and cancelled jobs." count={closed.length} startOpen={false}>
        {closed.length ? <ul className="flex flex-col divide-y divide-line">{closed.map((j) => <li key={j.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
          <span className="min-w-0"><Link className="break-words text-label text-accent-text underline underline-offset-4" href={href(j.number)}>{jobNumber(j.number)} · {j.title}</Link>
            <span className="block break-words text-caption text-ink-muted">{j.requester.name || j.requester.email} · {j.type.name}</span></span>
          <JobStatusChip status={j.status} /></li>)}</ul> : <p className="text-body-ui text-ink-muted">No closed jobs.</p>}
      </CollapsibleSection>
    </> : filtered ? <EmptyState title="No jobs match these filters" mood="sleepy" action={<Link className={buttonClasses({ variant: "secondary" })} href={`/dashboard/${view.space.slug}/jobs`}>Clear filters</Link>}>Try fewer filters to see more jobs.</EmptyState>
      : <EmptyState title="No jobs yet" patch>New requests from makers will appear here.</EmptyState>}
  </div>;
}
