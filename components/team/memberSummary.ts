import type { SpaceRole } from "@prisma/client";
import { STAFF_ROLES, type StaffRole } from "@/lib/permissionRoles";

/** Client-safe row for the staff list. `email` is present only for space-manager viewers. */
export type SpaceMemberRow = {
  id: string;
  userId: string;
  name: string | null;
  email?: string | null;
  role: SpaceRole;
  joinedLabel: string;
  isYou: boolean;
  /** Machine type managers: the types they look after. */
  typeIds?: string[];
};

export type TeamFilter = "everyone" | "managers" | "machines";

export type RoleCounts = Record<StaffRole, number>;

export { ROLE_LABELS } from "@/lib/permissionRoles";

export const EMPTY_ROLE_COUNTS: RoleCounts = { MACHINE_MANAGER: 0, TYPE_MANAGER: 0, OPERATOR: 0, TECHNICIAN: 0, VIEWER: 0 };

const NOUNS: Record<StaffRole, [string, string]> = {
  MACHINE_MANAGER: ["machine manager", "machine managers"],
  TYPE_MANAGER: ["machine type manager", "machine type managers"],
  OPERATOR: ["operator", "operators"],
  TECHNICIAN: ["technician", "technicians"],
  VIEWER: ["viewer", "viewers"],
};

/** "1 machine manager · 2 machine type managers · 3 operators", skipping roles nobody holds. */
export function roleBreakdown(counts: RoleCounts) {
  const parts = STAFF_ROLES.filter((role) => counts[role] > 0).map((role) => `${counts[role]} ${counts[role] === 1 ? NOUNS[role][0] : NOUNS[role][1]}`);
  return parts.length ? parts.join(" · ") : "No one yet";
}

/**
 * One dot per person, most senior role first. Above `cap` people the dots are shared out proportionally,
 * keeping at least one dot for every role someone holds.
 */
export function roleDots(counts: RoleCounts, cap = 24): StaffRole[] {
  const total = STAFF_ROLES.reduce((sum, role) => sum + counts[role], 0);
  if (total === 0) return [];
  const slots = Math.min(total, cap);
  const allocation = STAFF_ROLES.map((role) => (counts[role] > 0 ? Math.max(1, Math.round((counts[role] / total) * slots)) : 0));
  // Trim or pad the largest group so the total matches the slot count.
  let diff = allocation.reduce((sum, n) => sum + n, 0) - slots;
  while (diff !== 0) {
    const largest = allocation.indexOf(Math.max(...allocation));
    allocation[largest] += diff > 0 ? -1 : 1;
    diff += diff > 0 ? -1 : 1;
  }
  return STAFF_ROLES.flatMap((role, index) => Array.from({ length: allocation[index] }, () => role));
}

/** "managers" runs the whole space (machine managers); "machines" is everyone else on staff. */
export function matchesFilter(role: SpaceRole, filter: TeamFilter) {
  if (filter === "managers") return role === "MACHINE_MANAGER";
  if (filter === "machines") return role === "TYPE_MANAGER" || role === "OPERATOR" || role === "TECHNICIAN" || role === "VIEWER";
  return true;
}

/** Case-insensitive match on name, and on email only when the viewer was sent one. */
export function matchesSearch(row: Pick<SpaceMemberRow, "name" | "email">, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (row.name?.toLowerCase().includes(needle)) return true;
  return Boolean(row.email && row.email.toLowerCase().includes(needle));
}

export function filterTeam(rows: SpaceMemberRow[], filter: TeamFilter, query: string) {
  return rows.filter((row) => matchesFilter(row.role, filter) && matchesSearch(row, query));
}

export function firstName(name: string | null | undefined) {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || null;
}
