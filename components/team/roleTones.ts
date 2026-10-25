import type { SpaceRole } from "@prisma/client";

/** Chip and avatar tones per role, shared by the team list, role picker and roles card. */
export const ROLE_TONES = {
  MACHINE_MANAGER: "ink",
  TYPE_MANAGER: "warning",
  OPERATOR: "info",
  TECHNICIAN: "success",
  VIEWER: "neutral",
  MEMBER: "outline",
} as const satisfies Record<SpaceRole, string>;

export const DOT_TONES: Record<SpaceRole, string> = {
  MACHINE_MANAGER: "bg-primary",
  TYPE_MANAGER: "bg-highlight",
  OPERATOR: "bg-info-solid",
  TECHNICIAN: "bg-success-solid",
  VIEWER: "bg-line-strong",
  MEMBER: "bg-line",
};
