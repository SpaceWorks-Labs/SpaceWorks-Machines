import type { SpaceMember, SpaceRole, SpaceStatus } from "@prisma/client";

/** Every staff role, most senior first. MEMBER (a maker) is not staff. */
export const STAFF_ROLES = ["MACHINE_MANAGER", "TYPE_MANAGER", "OPERATOR", "TECHNICIAN", "VIEWER"] as const satisfies readonly SpaceRole[];
export type StaffRole = (typeof STAFF_ROLES)[number];
const ALL_STAFF = STAFF_ROLES;
/** The whole makerspace (owner decisions 2026-10-24: no Owner or Space manager role; the Machine manager is top). */
const SPACE_MANAGERS = ["MACHINE_MANAGER"] as const;
/** The machine side; TYPE_MANAGER holds these only for its assigned machine types (lib/typeScope.ts). */
const MACHINE_SIDE = ["MACHINE_MANAGER", "TYPE_MANAGER"] as const;

/**
 * What each space role may do. The Machine manager is the top role and runs the whole makerspace, including
 * the team, other machine managers and deleting the space. A machine-type manager has the machine-side capabilities below, but
 * every loader and action narrows them to the types assigned to them (lib/typeScope.ts): other types answer
 * 404. Operators run jobs; technicians keep machines working; viewers read. MEMBER (a maker) holds no staff
 * capability. Unknown capabilities grant nothing.
 */
export const CAPABILITIES = {
  "space.view": ALL_STAFF,
  "space.settings": SPACE_MANAGERS,
  "space.delete": SPACE_MANAGERS,
  "team.manage": SPACE_MANAGERS,
  "members.manage": SPACE_MANAGERS,
  "machines.view": ALL_STAFF,
  "machines.manage": MACHINE_SIDE,
  /** Set a machine's status by hand (idle, reserved, maintenance, offline) with a note. */
  "machines.status": [...MACHINE_SIDE, "OPERATOR", "TECHNICIAN"],
  /** Makerspace-wide machine settings: job settings, space-default prices, creating, archiving and ordering types. */
  "machine.settings": SPACE_MANAGERS,
  /** One type's settings (fields, file policy, queue rules) and its type and machine prices. */
  "type.settings": MACHINE_SIDE,
  "printers.manage": MACHINE_SIDE,
  "jobs.view": ALL_STAFF,
  "jobs.review": [...MACHINE_SIDE, "OPERATOR"],
  "jobs.operate": [...MACHINE_SIDE, "OPERATOR"],
  "consumables.view": ALL_STAFF,
  "consumables.manage": [...SPACE_MANAGERS, "OPERATOR"],
  "maintenance.view": ALL_STAFF,
  "maintenance.manage": [...MACHINE_SIDE, "TECHNICIAN"],
  "payments.view": SPACE_MANAGERS,
  "payments.manage": SPACE_MANAGERS,
  "payments.settings": SPACE_MANAGERS,
  "reports.view": [...MACHINE_SIDE, "VIEWER"],
  "audit.view": MACHINE_SIDE,
  "integrations.manage": SPACE_MANAGERS,
} as const satisfies Record<string, readonly SpaceRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: SpaceRole | null | undefined, capability: Capability): boolean {
  return role != null && (CAPABILITIES[capability] as readonly SpaceRole[]).includes(role);
}

export function isStaffRole(role: SpaceRole | null | undefined): role is StaffRole {
  return role != null && role !== "MEMBER";
}

/**
 * Capabilities a suspended or archived space keeps: reading what is there and settling money already
 * received. Everything else waits until the space is active again.
 */
export const SUSPENDED_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(["space.view", "machines.view", "consumables.view", "jobs.view", "maintenance.view", "payments.view", "payments.manage", "reports.view", "audit.view"]);

/** Whether a space in this status may use a capability at all. Before approval: none. */
export function spaceAllows(status: SpaceStatus, capability: Capability): boolean {
  if (status === "ACTIVE") return true;
  if (status === "SUSPENDED" || status === "ARCHIVED") return SUSPENDED_CAPABILITIES.has(capability);
  return false;
}

/** Seniority, only for who may change whose role. */
const roleRank: Record<SpaceRole, number> = { MEMBER: 0, VIEWER: 1, TECHNICIAN: 2, OPERATOR: 2, TYPE_MANAGER: 3, MACHINE_MANAGER: 4 };

export function hasRoleAtLeast(role: SpaceRole, min: SpaceRole): boolean {
  return roleRank[role] >= roleRank[min];
}

/** Whoever runs the whole makerspace: the Machine manager. */
export function isSpaceManager(role: SpaceRole | null | undefined): boolean {
  return role === "MACHINE_MANAGER";
}

/**
 * Machine managers manage everyone, other machine managers included; nobody else manages the team. Removing,
 * demoting or the leaving of the last active machine manager is refused separately (lib/lastManager.ts).
 */
export function canManageTeamMember(actor: SpaceRole, target: SpaceRole): boolean {
  void target;
  return actor === "MACHINE_MANAGER";
}

/** The roles an actor may hand out (on an invite or a role change). */
export function assignableRoles(actor: SpaceRole): SpaceRole[] {
  return actor === "MACHINE_MANAGER" ? [...STAFF_ROLES, "MEMBER"] : [];
}

export function canManageTeam(m: Pick<SpaceMember, "role"> | null): boolean {
  return m != null && can(m.role, "team.manage");
}

export function canDeleteSpace(m: Pick<SpaceMember, "role"> | null): boolean {
  return m != null && can(m.role, "space.delete");
}

export const ROLE_LABELS: Record<SpaceRole, string> = {
  MACHINE_MANAGER: "Machine manager",
  TYPE_MANAGER: "Machine type manager",
  OPERATOR: "Operator",
  TECHNICIAN: "Technician",
  VIEWER: "Viewer",
  MEMBER: "Maker",
};

export const ROLE_DESCRIPTIONS: Record<SpaceRole, string> = {
  MACHINE_MANAGER: "Everything: machines and every machine setting, jobs, payments, the team (other machine managers too), integrations, settings and deleting the space.",
  TYPE_MANAGER: "Only the machine types they're given: those types' settings and prices, their machines, jobs and upkeep.",
  OPERATOR: "Reviews and runs jobs, and records consumables.",
  TECHNICIAN: "Maintenance, faults and service history.",
  VIEWER: "Reads machines, jobs, maintenance and reports.",
  MEMBER: "A maker: submits jobs and pays for them.",
};

export function roleLabel(role: SpaceRole) {
  return ROLE_LABELS[role];
}

/** Staff (any role except MEMBER) must use an authenticator app; makers and super admins need not. */
export const STAFF_AUTHENTICATOR_SETUP = "/account/security?authenticator=required";
export const STAFF_AUTHENTICATOR_MESSAGE = "Your role in this space needs an authenticator app. Set one up under Account, Security, then try again.";
