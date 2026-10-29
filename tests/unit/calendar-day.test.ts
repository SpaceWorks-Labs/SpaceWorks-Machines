import { describe, expect, it } from "vitest";
import { calendarDayAt, financialDay, parseCalendarDay } from "@/lib/calendarDay";
import { machineDetailsSchema } from "@/lib/machines/schemas";
import { manualEntrySchema, payoutSchema, toBuyStepSchema } from "@/lib/repairs/schemas";
import { financePeriod } from "@/lib/finance/period";

describe("space calendar dates", () => {
  it.each(["2026-02-29", "2026-02-31", "2026-13-01", "2026-01-00", "not-a-date"])("rejects impossible date %s without normalisation", (day) => {
    expect(parseCalendarDay(day)).toBeNull();
    expect(() => financialDay(day, "Asia/Kolkata")).toThrow("Choose a valid date");
    expect(machineDetailsSchema.safeParse({ name: "Machine", acquiredOn: day }).success).toBe(false);
    expect(payoutSchema.safeParse({ spaceSlug: "demo", faultId: "fault", amount: 1, method: "CASH", paidOn: day }).success).toBe(false);
    expect(toBuyStepSchema.safeParse({ spaceSlug: "demo", itemId: "item", status: "BOUGHT", boughtOn: day }).success).toBe(false);
    expect(manualEntrySchema.safeParse({ spaceSlug: "demo", amount: 1, method: "CASH", category: "OTHER_INCOME", note: "Gift", occurredOn: day }).success).toBe(false);
  });

  it("accepts a leap day while preserving date-only database values", () => {
    expect(parseCalendarDay("2028-02-29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it.each([
    ["Asia/Kolkata", "2026-10-30", "2026-10-29T18:30:00.000Z"],
    ["America/Los_Angeles", "2026-10-29", "2026-10-29T07:00:00.000Z"],
    ["America/New_York", "2026-03-08", "2026-03-08T05:00:00.000Z"],
    ["America/New_York", "2026-11-01", "2026-11-01T04:00:00.000Z"],
    ["Pacific/Kiritimati", "2026-10-30", "2026-10-29T10:00:00.000Z"],
  ])("resolves %s %s to local midnight, including DST", (zone, day, instant) => {
    const resolved = financialDay(day, zone)!;
    expect(resolved.toISOString()).toBe(instant);
    expect(calendarDayAt(resolved, zone)).toBe(day);
    const period = financePeriod("day", day, zone);
    expect(resolved.getTime()).toBeGreaterThanOrEqual(period.from.getTime());
    expect(resolved.getTime()).toBeLessThan(period.to.getTime());
  });

  it("does not silently clamp tomorrow into today", () => {
    const now = new Date("2026-10-29T20:34:00Z");
    expect(calendarDayAt(now, "Asia/Kolkata")).toBe("2026-10-30");
    expect(financialDay("2026-10-30", "Asia/Kolkata")!.getTime()).toBeLessThan(now.getTime());
    expect(financialDay("2026-10-31", "Asia/Kolkata")!.getTime()).toBeGreaterThan(now.getTime());
    expect(calendarDayAt(now, "America/Los_Angeles")).toBe("2026-10-29");
    expect(financialDay(undefined, "Asia/Kolkata")).toBeUndefined();
  });
});
