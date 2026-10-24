import { describe, expect, it } from "vitest";
import type { SpaceRole } from "@prisma/client";
import { assignableRoles, can, CAPABILITIES, canManageTeamMember, isStaffRole, ROLE_LABELS, STAFF_ROLES, type Capability } from "@/lib/permissionRoles";

const ALL: SpaceRole[] = [...STAFF_ROLES, "MEMBER"];
const holders = (capability: Capability) => ALL.filter((role) => can(role, capability));

describe("space roles and capabilities", () => {
  it("gives the whole makerspace to the machine manager alone", () => {
    for (const capability of ["space.settings", "space.delete", "team.manage", "members.manage", "payments.view", "payments.settings", "payments.manage", "integrations.manage", "machine.settings"] as const) {
      expect(holders(capability)).toEqual(["MACHINE_MANAGER"]);
    }
  });

  it("gives machine type managers the machine side (scoped to their types elsewhere)", () => {
    for (const capability of ["machines.manage", "type.settings", "printers.manage", "audit.view"] as const) {
      expect(holders(capability)).toEqual(["MACHINE_MANAGER", "TYPE_MANAGER"]);
    }
    expect(can("TYPE_MANAGER", "machine.settings")).toBe(false);
    expect(can("TYPE_MANAGER", "team.manage")).toBe(false);
    expect(can("TYPE_MANAGER", "payments.view")).toBe(false);
  });

  it("gives operators jobs and consumables, and technicians maintenance", () => {
    expect(holders("jobs.review")).toEqual(["MACHINE_MANAGER", "TYPE_MANAGER", "OPERATOR"]);
    expect(holders("jobs.operate")).toEqual(["MACHINE_MANAGER", "TYPE_MANAGER", "OPERATOR"]);
    expect(holders("consumables.manage")).toEqual(["MACHINE_MANAGER", "OPERATOR"]);
    expect(holders("maintenance.manage")).toEqual(["MACHINE_MANAGER", "TYPE_MANAGER", "TECHNICIAN"]);
    expect(holders("reports.view")).toEqual(["MACHINE_MANAGER", "TYPE_MANAGER", "VIEWER"]);
  });

  it("lets every staff role read, and makers hold no staff capability", () => {
    for (const capability of ["space.view", "machines.view", "consumables.view", "jobs.view", "maintenance.view"] as const) expect(holders(capability)).toEqual([...STAFF_ROLES]);
    for (const capability of Object.keys(CAPABILITIES) as Capability[]) expect(can("MEMBER", capability)).toBe(false);
    expect(can(null, "space.view")).toBe(false);
    expect(isStaffRole("MEMBER")).toBe(false);
    expect(STAFF_ROLES.every(isStaffRole)).toBe(true);
  });

  it("lets machine managers manage everyone, other machine managers included, and nobody else manage anyone", () => {
    for (const target of ALL) expect(canManageTeamMember("MACHINE_MANAGER", target)).toBe(true);
    for (const actor of ["TYPE_MANAGER", "OPERATOR", "TECHNICIAN", "VIEWER", "MEMBER"] as const) {
      expect(canManageTeamMember(actor, "MEMBER")).toBe(false);
      expect(assignableRoles(actor)).toEqual([]);
    }
    expect(assignableRoles("MACHINE_MANAGER")).toEqual([...STAFF_ROLES, "MEMBER"]);
  });

  it("has no owner or space manager role, and labels the two manager roles distinctly", () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(["MACHINE_MANAGER", "MEMBER", "OPERATOR", "TECHNICIAN", "TYPE_MANAGER", "VIEWER"]);
    expect(ROLE_LABELS.MACHINE_MANAGER).toBe("Machine manager");
    expect(ROLE_LABELS.TYPE_MANAGER).toBe("Machine type manager");
    expect(ROLE_LABELS.MEMBER).toBe("Maker");
    for (const label of Object.values(ROLE_LABELS)) expect(label.toLowerCase()).not.toContain("owner");
  });
});
