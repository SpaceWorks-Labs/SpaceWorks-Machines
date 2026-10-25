import type { JoinPolicy } from "@prisma/client";

/** Client-safe words for a space's join policy. */
export const JOIN_POLICY_LABELS: Record<JoinPolicy, string> = {
  OPEN: "Anyone can join",
  APPROVAL: "Makers ask; a machine manager approves",
  INVITE_ONLY: "Invite only",
};
