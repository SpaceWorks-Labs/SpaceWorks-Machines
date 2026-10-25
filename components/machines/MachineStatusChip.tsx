import type { MachineStatus } from "@prisma/client";
import { Chip, type ChipTone } from "@/components/ui/display";

export const MACHINE_STATUS_LABELS: Record<MachineStatus, string> = {
  IDLE: "Idle", RUNNING: "Running", PAUSED: "Paused", RESERVED: "Reserved", MAINTENANCE: "Maintenance", OFFLINE: "Offline",
};
const tones: Record<MachineStatus, ChipTone> = {
  IDLE: "success", RUNNING: "info", PAUSED: "warning", RESERVED: "accent", MAINTENANCE: "warning", OFFLINE: "neutral",
};

/** Machine state always carries a word, including when retired. */
export function MachineStatusChip({ status, retired = false }: { status: MachineStatus; retired?: boolean }) {
  return <Chip tone={retired ? "neutral" : tones[status]}>{retired ? "Retired" : MACHINE_STATUS_LABELS[status]}</Chip>;
}
