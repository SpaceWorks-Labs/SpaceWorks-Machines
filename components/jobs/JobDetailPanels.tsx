import Link from "next/link";
import { ExternalLink, Link2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/display";
import { duration, money, words } from "@/lib/jobs/presentation";
import type { JobDetail } from "@/lib/jobs/viewQueries";

export function dateLabel(value: string) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC"; }
export function JobDetailPanels({ job, spaceSlug, showPrice = true }: { job: JobDetail; spaceSlug: string; showPrice?: boolean }) {
  return <>
    {job.queue ? <p className="text-body-l text-ink-secondary">{job.queue}</p> : null}
    {job.remainingMinutes != null ? <p className="text-body-ui">About {duration(job.remainingMinutes)} left (estimate)</p> : null}
    <Card as="section"><CardHeader title="Request" />
      {job.description ? <p className="whitespace-pre-wrap break-words text-body-ui">{job.description}</p> : <p className="text-body-ui text-ink-muted">No description provided.</p>}
      <p className="mt-3 text-body-ui">Quantity: {job.quantity}</p>
      {job.sourceLink ? <a href={job.sourceLink} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-body-ui text-accent-text underline underline-offset-4" rel="noreferrer" target="_blank">Source link<ExternalLink aria-hidden className="size-4" /><span className="sr-only">(opens in a new tab)</span></a> : null}
      {job.requestRows.length ? <dl className="mt-4 grid gap-2 sm:grid-cols-2">{job.requestRows.map((row) => <div key={row.key} className="min-w-0"><dt className="text-caption text-ink-secondary">{row.label}</dt><dd className="break-words text-body-ui">{row.value}</dd></div>)}</dl> : null}
      {job.statusReason ? <p className="mt-4 whitespace-pre-wrap break-words text-body-ui">{job.statusReason}</p> : null}
    </Card>
    {showPrice ? <Card as="section"><CardHeader title="Price" /><p className="text-title">{(job.finalAmount ?? job.quotedAmount) === 0 ? "Free" : job.finalAmount != null ? money(job.finalAmount, job.currency) : job.quotedAmount != null ? money(job.quotedAmount, job.currency) : "Estimated after review"}</p>
      <p className="mt-2 text-body-ui">{words(job.paymentState)}{job.paymentTiming === "PAY_LATER" && job.paymentState !== "PAID" && job.paymentState !== "NOT_REQUIRED" ? " · Payment pending" : ""}</p>
      <p className="mt-2 text-body-ui text-ink-secondary">Paid: {money(job.amountPaid, job.currency)} · Refunded: {money(job.amountRefunded, job.currency)}</p>
    </Card> : null}
    <Card as="section"><CardHeader title="Files" />{job.files.length ? <ul className="flex flex-col gap-3">{job.files.map((f) => <li key={f.id} className="min-w-0"><a className="break-all text-body-ui text-accent-text underline underline-offset-4" href={`/api/uploads/jobs/${spaceSlug}/${job.id}/${f.id}`}>{f.filename}</a><span className="ml-2 text-caption text-ink-secondary">{Math.ceil(f.sizeBytes / 1024)} KB</span></li>)}</ul> : <p className="text-body-ui text-ink-muted">No files attached.</p>}</Card>
    <Card as="section" aria-label="Timeline"><CardHeader title="Timeline" /><ol className="flex flex-col divide-y divide-line">{job.events.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-3"><div className="min-w-0"><p className="text-body-ui">{words(e.kind)}</p>{e.note ? <p className="whitespace-pre-wrap break-words text-body-ui text-ink-secondary">{e.note}</p> : null}</div><time className="text-caption text-ink-secondary" dateTime={e.createdAt}>{dateLabel(e.createdAt)}</time></li>)}</ol></Card>
    <Card as="section"><CardHeader title="Notes" />{job.notes.length ? <ul className="flex flex-col gap-4">{job.notes.map((n) => <li key={n.id}><p className="whitespace-pre-wrap break-words text-body-ui">{n.body}</p><p className="text-caption text-ink-secondary">{n.internal ? "Internal · " : ""}{dateLabel(n.createdAt)}</p></li>)}</ul> : <p className="text-body-ui text-ink-muted">No notes yet.</p>}</Card>
    {job.statusToken ? <Link className="inline-flex min-h-11 items-center gap-1.5 self-start text-body-ui text-accent-text underline underline-offset-4" href={`/j/${job.statusToken}`}><Link2 aria-hidden className="size-4" />Public status link</Link> : null}
  </>;
}
