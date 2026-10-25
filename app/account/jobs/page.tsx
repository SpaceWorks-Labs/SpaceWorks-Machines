import Link from "next/link";
import type { Metadata } from "next";
import { loadAccountJobsView } from "@/lib/views/app__account__jobs__page";
import { EmptyState, Card, SectionHeading } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { JobStatusChip } from "@/components/jobs/JobStatusChip";
import { jobNumber } from "@/lib/jobs/presentation";

export const metadata: Metadata = { title: "Your jobs", robots: { index: false, follow: false } };
export default async function AccountJobsPage() {
  const { jobs } = await loadAccountJobsView();
  return <div className="flex flex-col gap-6"><SectionHeading title="Your jobs" description="Requests you've sent to any space, newest first." />{jobs.length ? <ul className="flex flex-col gap-3" aria-label="Your jobs">{jobs.map((j) => <li key={j.id}><Card padding="sm" className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1"><Link className="break-words text-label text-accent-text underline underline-offset-4" href={`/s/${j.space.slug}/jobs/${j.number}`}>{jobNumber(j.number)} · {j.title}</Link><p className="text-caption text-ink-muted">{j.space.name}</p></div><JobStatusChip status={j.status} /></Card></li>)}</ul> : <EmptyState title="No jobs yet" patch action={<Link href="/spaces" className={buttonClasses({ variant: "secondary", size: "sm" })}>Find a makerspace</Link>}>Your requests from every space will appear here.</EmptyState>}</div>;
}
