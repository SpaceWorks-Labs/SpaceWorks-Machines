import type { JobStatus } from "@prisma/client";
import { Chip, type ChipTone } from "@/components/ui/display";
import { STATUS_LABELS } from "@/lib/jobs/presentation";

const tones: Partial<Record<JobStatus, ChipTone>> = { RUNNING: "info", APPROVED: "accent", COMPLETED: "success", COLLECTED: "success", FAILED: "danger", REJECTED: "danger", PAUSED: "warning" };
export function JobStatusChip({ status }: { status: JobStatus }) { return <Chip tone={tones[status] ?? "neutral"}>{STATUS_LABELS[status]}</Chip>; }
