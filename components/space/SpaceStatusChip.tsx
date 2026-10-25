import type { SpaceStatus } from "@prisma/client";
import { Chip, type ChipTone } from "@/components/ui/display";

const STATUS: Record<SpaceStatus, { label: string; tone: ChipTone }> = {
  PENDING_REVIEW: { label: "Under review", tone: "info" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "warning" },
  ACTIVE: { label: "Active", tone: "success" },
  REJECTED: { label: "Not approved", tone: "danger" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

/** A space's lifecycle state, always as a word (never colour alone). */
export function SpaceStatusChip({ status, size = "sm" }: { status: SpaceStatus; size?: "sm" | "md" }) {
  const { label, tone } = STATUS[status];
  return <Chip size={size} tone={tone}>{label}</Chip>;
}

export const SPACE_STATUS_LABELS: Record<SpaceStatus, string> = Object.fromEntries(
  Object.entries(STATUS).map(([status, { label }]) => [status, label]),
) as Record<SpaceStatus, string>;
