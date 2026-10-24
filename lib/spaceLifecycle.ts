import type { SpaceReviewAction, SpaceStatus } from "@prisma/client";

/** Lifecycle decisions a space's machine managers are told about by email. */
export type SpaceNotice = "received" | "approved" | "changes-requested" | "rejected" | "suspended" | "reactivated" | "created";

export const SPACE_NOTICES: readonly SpaceNotice[] = ["received", "approved", "changes-requested", "rejected", "suspended", "reactivated", "created"];

/** What a platform admin can decide about a space. */
export type ReviewDecision = "approve" | "request-changes" | "reject" | "suspend" | "reactivate" | "archive";

type Transition = {
  from: readonly SpaceStatus[];
  to: SpaceStatus;
  action: SpaceReviewAction;
  /** Email to the machine managers, or null for a silent change. */
  notice: SpaceNotice | null;
  /** The machine managers are always told why a refusal, change request or suspension happened. */
  reasonRequired: boolean;
  label: string;
  /** Shown before a decision that takes access away. */
  confirm?: string;
};

export const REVIEW_DECISIONS: Record<ReviewDecision, Transition> = {
  approve: {
    from: ["PENDING_REVIEW", "CHANGES_REQUESTED"],
    to: "ACTIVE",
    action: "APPROVED",
    notice: "approved",
    reasonRequired: false,
    label: "Approve",
  },
  "request-changes": {
    from: ["PENDING_REVIEW"],
    to: "CHANGES_REQUESTED",
    action: "CHANGES_REQUESTED",
    notice: "changes-requested",
    reasonRequired: true,
    label: "Ask for changes",
  },
  reject: {
    from: ["PENDING_REVIEW", "CHANGES_REQUESTED"],
    to: "REJECTED",
    action: "REJECTED",
    notice: "rejected",
    reasonRequired: true,
    label: "Decline",
    confirm: "The applicant is told it was not approved. Its web address is held for 30 days, then released.",
  },
  suspend: {
    from: ["ACTIVE"],
    to: "SUSPENDED",
    action: "SUSPENDED",
    notice: "suspended",
    reasonRequired: true,
    label: "Suspend",
    confirm: "New makers can't join and staff can only read and settle money already received. Records stay.",
  },
  reactivate: {
    from: ["SUSPENDED", "ARCHIVED"],
    to: "ACTIVE",
    action: "REACTIVATED",
    notice: "reactivated",
    reasonRequired: false,
    label: "Reactivate",
  },
  archive: {
    from: ["ACTIVE", "SUSPENDED"],
    to: "ARCHIVED",
    action: "ARCHIVED",
    notice: null,
    reasonRequired: false,
    label: "Archive",
    confirm: "Archive this space? It stops taking makers; its records stay readable.",
  },
};

export const REVIEW_DECISION_ORDER: readonly ReviewDecision[] = ["approve", "request-changes", "reject", "reactivate", "suspend", "archive"];

/** Decisions open to a platform admin for a space in this status, in display order. */
export function decisionsFor(status: SpaceStatus): ReviewDecision[] {
  return REVIEW_DECISION_ORDER.filter((decision) => REVIEW_DECISIONS[decision].from.includes(status));
}

export function isReviewDecision(value: unknown): value is ReviewDecision {
  return typeof value === "string" && Object.hasOwn(REVIEW_DECISIONS, value);
}

/** Why an action is refused for a space that isn't active. */
export const SPACE_LOCKED = "This can't be changed while the space is under review, suspended or archived.";

/** Suspended and archived spaces keep their records. */
export function canDeleteInStatus(status: SpaceStatus): boolean {
  return status !== "SUSPENDED" && status !== "ARCHIVED";
}

/** Only an application sent back for changes can be edited and sent again by its team. */
export function canResubmit(status: SpaceStatus): boolean {
  return status === "CHANGES_REQUESTED";
}

/** How each review row reads in a timeline, for the applicant and the platform admin alike. */
export const REVIEW_ACTION_LABELS: Record<SpaceReviewAction, string> = {
  SUBMITTED: "Application sent",
  RESUBMITTED: "Application updated and sent again",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  REJECTED: "Not approved",
  SUSPENDED: "Suspended",
  REACTIVATED: "Reactivated",
  ARCHIVED: "Archived",
  CREATED: "Set up by a platform admin",
};

/** What the team sees on its application page for each status. */
export const STATUS_EXPLANATIONS: Record<SpaceStatus, { title: string; body: string }> = {
  PENDING_REVIEW: {
    title: "Your application is being reviewed",
    body: "A platform admin will look at it. We'll email the machine managers when there is a decision.",
  },
  CHANGES_REQUESTED: {
    title: "A few changes are needed",
    body: "Read the note from the platform team, update your details below and send the application again.",
  },
  ACTIVE: {
    title: "Your space is approved",
    body: "Everything is open. Invite your staff and share your space's page with makers.",
  },
  REJECTED: {
    title: "Your application was not approved",
    body: "The note below says why. If you think this is a mistake, contact the platform operator.",
  },
  SUSPENDED: {
    title: "Your space is suspended",
    body: "New makers can't join and most changes are paused. Staff can still read everything and settle payments already received.",
  },
  ARCHIVED: {
    title: "Your space is archived",
    body: "It no longer takes makers. Its records stay readable.",
  },
};
