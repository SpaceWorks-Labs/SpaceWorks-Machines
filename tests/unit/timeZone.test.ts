import { describe, expect, it } from "vitest";
import { zonedDatetimeLocalValue, zonedInputToIso } from "@/lib/timeZone";

describe("zoned datetime conversion", () => {
  it("does not throw when legacy data contains an invalid timestamp", () => {
    expect(zonedDatetimeLocalValue(new Date("invalid"), "UTC")).toBe("");
  });

  it("preserves a Kolkata wall-clock time as a UTC instant", () => {
    expect(zonedInputToIso("2030-06-15T09:30", "Asia/Kolkata")).toBe("2030-06-15T04:00:00.000Z");
  });

  it("uses daylight-saving offsets and round-trips the wall-clock time", () => {
    const iso = zonedInputToIso("2030-06-15T09:30", "America/New_York");
    expect(iso).toBe("2030-06-15T13:30:00.000Z");
    expect(zonedDatetimeLocalValue(new Date(iso!), "America/New_York")).toBe("2030-06-15T09:30");
  });

  it("rejects a nonexistent time during the daylight-saving transition", () => {
    expect(zonedInputToIso("2030-03-10T02:30", "America/New_York")).toBeNull();
  });
});
