import type { Metadata } from "next";
import { loadPublicJobView } from "@/lib/views/app__j__token__page";
import { JobStatusChip } from "@/components/jobs/JobStatusChip";
import { dateLabel } from "@/components/jobs/JobDetailPanels";

export const metadata: Metadata = { title: "Job status", robots: { index: false, follow: false } };
export default async function PublicJobStatusPage(props: Parameters<typeof loadPublicJobView>[0]) {
  const job = await loadPublicJobView(props);
  return <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-[760px] flex-col gap-6 px-5 py-12"><p className="text-caption text-ink-secondary">Job status</p><h1 className="break-words text-h1">{job.title}</h1><div><JobStatusChip status={job.status} /></div>{job.queue ? <p className="text-body-l text-ink-secondary">{job.queue}</p> : null}<dl className="flex flex-col gap-4">{job.timestamps.map((t) => <div key={t.label}><dt className="text-label">{t.label}</dt><dd className="text-body-ui text-ink-secondary"><time dateTime={t.value}>{dateLabel(t.value)}</time></dd></div>)}</dl></main>;
}
