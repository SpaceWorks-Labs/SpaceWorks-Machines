"use client";

import { useId, type ReactNode } from "react";
import { CollapsibleToggle, useRememberedOpen } from "@/components/ui/collapsible";
import type { Capability } from "@/lib/permissionRoles";

export type NavEntry = { path: string; label: string; capabilities: Capability[]; exact?: boolean };

/**
 * Space navigation, in order: Overview, then labelled groups that fold. Each entry shows when the role holds
 * any of its capabilities; a group shows when it has an entry.
 */
export const SPACE_NAV_GROUPS: Array<{ key: string; label: string | null; items: NavEntry[] }> = [
  { key: "home", label: null, items: [{ path: "", label: "Overview", capabilities: ["space.view"], exact: true }] },
  { key: "machines", label: "Machines", items: [
    { path: "/machines", label: "Machines", capabilities: ["machines.view"] },
    { path: "/jobs", label: "Jobs", capabilities: ["jobs.view"] },
    { path: "/consumables", label: "Consumables", capabilities: ["consumables.view"] },
    { path: "/machine-settings", label: "Machine settings", capabilities: ["machines.view"] },
  ] },
  { key: "upkeep", label: "Upkeep", items: [
    { path: "/maintenance", label: "Maintenance", capabilities: ["maintenance.view"] },
    { path: "/repairs", label: "Repairs", capabilities: ["maintenance.view"] },
    { path: "/to-buy", label: "To buy", capabilities: ["tobuy.request"] },
    { path: "/technicians", label: "Technicians", capabilities: ["technicians.manage"] },
  ] },
  { key: "money", label: "Money", items: [
    { path: "/payments", label: "Payments", capabilities: ["payments.view"] },
    { path: "/payouts", label: "Payouts", capabilities: ["repairs.pay"] },
    { path: "/finance", label: "Finance", capabilities: ["finance.view"] },
  ] },
  { key: "space", label: "Space", items: [
    { path: "/reports", label: "Reports", capabilities: ["reports.view"] },
    { path: "/team", label: "Team", capabilities: ["space.view"] },
    { path: "/integrations", label: "Integrations", capabilities: ["integrations.manage", "printers.manage"] },
    { path: "/audit", label: "Audit log", capabilities: ["audit.view"] },
    { path: "/settings", label: "Space settings", capabilities: ["space.settings"] },
  ] },
];

/** Every entry, in navigation order. */
export const SPACE_NAV: NavEntry[] = SPACE_NAV_GROUPS.flatMap((group) => group.items);

/** A labelled group that folds; the group holding the current page is always open, others are remembered. */
export function NavGroup({ groupKey, label, current, children }: { groupKey: string; label: string; current: boolean; children: ReactNode }) {
  const [remembered, setOpen] = useRememberedOpen(`swm:nav:${groupKey}`, true);
  const open = current || remembered;
  const id = useId();
  return (
    <div className="mt-2 flex flex-col gap-1">
      <CollapsibleToggle open={open} onToggle={() => setOpen(!open)} controls={id} className="rounded-control px-4 text-overline text-ink-muted hover:bg-sidebar-hover">
        {label}
      </CollapsibleToggle>
      <div id={id} hidden={!open} className="flex flex-col gap-1">{children}</div>
    </div>
  );
}
