import { describe, expect, it } from "vitest";
import { EMPTY_ROLE_COUNTS, filterTeam, firstName, roleBreakdown, roleDots, type RoleCounts, type SpaceMemberRow } from "@/components/team/memberSummary";

const row = (overrides: Partial<SpaceMemberRow>): SpaceMemberRow => ({
  id: "m",
  userId: "u",
  name: "Someone",
  role: "VIEWER",
  joinedLabel: "Mar 2025",
  isYou: false,
  ...overrides,
});

const counts = (values: Partial<RoleCounts>): RoleCounts => ({ ...EMPTY_ROLE_COUNTS, ...values });

describe("team summary helpers", () => {
  it("describes the role mix, skipping empty roles", () => {
    expect(roleBreakdown(counts({ MACHINE_MANAGER: 1, TYPE_MANAGER: 2, OPERATOR: 3 }))).toBe("1 machine manager · 2 machine type managers · 3 operators");
    expect(roleBreakdown(counts({ MACHINE_MANAGER: 2, VIEWER: 1 }))).toBe("2 machine managers · 1 viewer");
    expect(roleBreakdown(counts({}))).toBe("No one yet");
  });

  it("draws one dot per person up to the cap, most senior first", () => {
    expect(roleDots(counts({ MACHINE_MANAGER: 1, TYPE_MANAGER: 2, TECHNICIAN: 1, VIEWER: 2 }))).toEqual(["MACHINE_MANAGER", "TYPE_MANAGER", "TYPE_MANAGER", "TECHNICIAN", "VIEWER", "VIEWER"]);
    const capped = roleDots(counts({ MACHINE_MANAGER: 1, TYPE_MANAGER: 4, OPERATOR: 1, VIEWER: 194 }), 24);
    expect(capped).toHaveLength(24);
    expect(capped[0]).toBe("MACHINE_MANAGER");
    expect(capped.filter((r) => r === "OPERATOR")).toHaveLength(1);
    expect(roleDots(counts({}))).toEqual([]);
  });

  it("filters by side and searches email only when it was sent", () => {
    const rows = [
      row({ id: "1", name: "Anand Nair", role: "MACHINE_MANAGER", email: "anand@example.org" }),
      row({ id: "2", name: "Riya Kapoor", role: "MACHINE_MANAGER", email: "riya@example.org" }),
      row({ id: "3", name: "Jo Thomas", role: "TYPE_MANAGER" }),
      row({ id: "4", name: "Sam Varghese", role: "TECHNICIAN" }),
    ];
    expect(filterTeam(rows, "managers", "").map((r) => r.id)).toEqual(["1", "2"]);
    expect(filterTeam(rows, "machines", "").map((r) => r.id)).toEqual(["3", "4"]);
    expect(filterTeam(rows, "everyone", "RIYA@").map((r) => r.id)).toEqual(["2"]);
    expect(filterTeam(rows, "everyone", "thomas").map((r) => r.id)).toEqual(["3"]);
    expect(filterTeam(rows.map((r) => ({ ...r, email: undefined })), "everyone", "example.org")).toEqual([]);
  });

  it("takes the first name for hints", () => {
    expect(firstName("  Priya L. ")).toBe("Priya");
    expect(firstName(null)).toBeNull();
  });
});
