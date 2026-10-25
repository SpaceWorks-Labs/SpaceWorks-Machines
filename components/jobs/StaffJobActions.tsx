import type { JobDetail } from "@/lib/jobs/viewQueries";
import type { JobCommand } from "@/lib/jobs/commands";
import { JobActionDialog } from "./JobActionDialog";
import type { CommandOptions } from "./JobCommandFields";

export function StaffJobActions({ job, spaceSlug, canReview, canOperate, options }: {
  job: JobDetail; spaceSlug: string; canReview: boolean; canOperate: boolean; options: CommandOptions;
}) {
  const commands: [JobCommand["kind"], string, string[], boolean][] = [
    ["approve", "Approve job", ["SUBMITTED"], canReview], ["reject", "Reject job", ["SUBMITTED", "APPROVED"], canReview],
    ["cancel", "Cancel job", ["SUBMITTED", "APPROVED", "PAUSED"], canReview], ["start", "Start job", ["APPROVED"], canOperate],
    ["pause", "Pause job", ["RUNNING"], canOperate], ["resume", "Resume job", ["PAUSED"], canOperate],
    ["complete", "Complete job", ["RUNNING", "PAUSED"], canOperate], ["fail", "Fail job", ["RUNNING", "PAUSED"], canOperate],
    ["collect", "Collect job", ["COMPLETED"], canOperate], ["reprint", "Reprint job", ["FAILED", "COMPLETED", "COLLECTED"], canReview],
    ["priority", "Change priority", ["SUBMITTED", "APPROVED"], canReview], ["reassign", "Reassign machine", ["SUBMITTED", "APPROVED"], canReview],
    ["note", "Add note", [job.status], canReview],
  ];
  // The job's next step in the workshop stands out; everything else stays secondary.
  const next: Partial<Record<JobDetail["status"], JobCommand["kind"]>> = { SUBMITTED: "approve", APPROVED: "start", RUNNING: "complete", PAUSED: "resume", COMPLETED: "collect" };
  return <div className="flex flex-wrap gap-2" role="group" aria-label="Job actions">
    {commands.filter(([, , statuses, allowed]) => allowed && statuses.includes(job.status)).map(([kind, label]) => <JobActionDialog key={kind} kind={kind} label={label} spaceSlug={spaceSlug} jobId={job.id} options={options} variant={next[job.status] === kind ? "primary" : undefined} />)}
    {options.canMoney && canOperate && ["APPROVED", "COMPLETED"].includes(job.status) ? <JobActionDialog kind={job.status === "APPROVED" ? "start" : "collect"} label={job.status === "APPROVED" ? "Start with payment override" : "Collect with payment override"} override spaceSlug={spaceSlug} jobId={job.id} options={options} /> : null}
  </div>;
}
