import { describe, expect, it } from "vitest";
import { backupInputToIso } from "@/lib/backupTime";

describe("instance settings backup time", () => {
  it("reads the datetime field as UTC, matching how the page fills it", () => {
    const stored = new Date("2026-10-18T10:00:00.000Z");
    const shown = stored.toISOString().slice(0, 16);
    // Saving the form unchanged must keep the stored time exactly.
    expect(backupInputToIso(shown)).toBe(stored.toISOString());
    expect(backupInputToIso("2026-10-18T10:00:30")).toBe("2026-10-18T10:00:30.000Z");
  });

  it("leaves empty or invalid values unset", () => {
    expect(backupInputToIso("")).toBeUndefined();
    expect(backupInputToIso("not a date")).toBeUndefined();
  });
});
