import { describe, expect, it } from "vitest";
import { advanceSchedule, reliability, scheduleDue, warrantyState, type ScheduleShape } from "@/lib/upkeep/due";
import { dueText } from "@/lib/upkeep/labels";

const DAY = 86_400_000;
const now = new Date("2026-10-24T12:00:00Z");
const base: ScheduleShape = { trigger: "TIME", intervalDays: 30, intervalHours: null, intervalJobs: null, nextDueAt: null, meterMinutesAtLast: 0, meterJobsAtLast: 0 };
const meters = { meterMinutes: 0, meterJobs: 0 };

describe("maintenance due state", () => {
  it("time schedules are on track, due soon within the reminder window, then overdue", () => {
    expect(scheduleDue({ ...base, nextDueAt: new Date(now.getTime() + 10 * DAY) }, meters, now, 3)).toMatchObject({ state: "OK", remaining: 10, unit: "days" });
    expect(scheduleDue({ ...base, nextDueAt: new Date(now.getTime() + 2 * DAY) }, meters, now, 3).state).toBe("DUE_SOON");
    expect(scheduleDue({ ...base, nextDueAt: new Date(now.getTime() - DAY) }, meters, now, 3)).toMatchObject({ state: "OVERDUE", remaining: -1 });
    expect(scheduleDue({ ...base, nextDueAt: now }, meters, now, 0).state).toBe("OVERDUE");
  });
  it("usage schedules count from the meters at the last completion and warn within 10 %", () => {
    const hours: ScheduleShape = { ...base, trigger: "USAGE_HOURS", intervalHours: 100, meterMinutesAtLast: 600 };
    expect(scheduleDue(hours, { meterMinutes: 600 + 80 * 60, meterJobs: 0 }, now, 3)).toMatchObject({ state: "OK", remaining: 20, unit: "hours" });
    expect(scheduleDue(hours, { meterMinutes: 600 + 91 * 60, meterJobs: 0 }, now, 3).state).toBe("DUE_SOON");
    expect(scheduleDue(hours, { meterMinutes: 600 + 100 * 60, meterJobs: 0 }, now, 3).state).toBe("OVERDUE");
    const jobs: ScheduleShape = { ...base, trigger: "JOB_COUNT", intervalJobs: 5, meterJobsAtLast: 10 };
    expect(scheduleDue(jobs, { meterMinutes: 0, meterJobs: 13 }, now, 3)).toMatchObject({ state: "OK", remaining: 2, unit: "jobs" });
    expect(scheduleDue(jobs, { meterMinutes: 0, meterJobs: 14 }, now, 3).state).toBe("DUE_SOON");
    expect(scheduleDue(jobs, { meterMinutes: 0, meterJobs: 16 }, now, 3)).toMatchObject({ state: "OVERDUE", remaining: -1 });
  });
  it("advances time schedules from the old due date and never into the past; usage resets the baseline", () => {
    const due = new Date("2026-10-01T00:00:00Z");
    expect(advanceSchedule({ ...base, nextDueAt: due }, meters, new Date("2026-10-05T00:00:00Z")).nextDueAt).toEqual(new Date("2026-10-31T00:00:00Z"));
    expect(advanceSchedule({ ...base, nextDueAt: due }, meters, new Date("2026-12-15T00:00:00Z")).nextDueAt).toEqual(new Date("2026-12-30T00:00:00Z"));
    expect(advanceSchedule({ ...base, trigger: "USAGE_HOURS", intervalHours: 10 }, { meterMinutes: 1234, meterJobs: 7 }, now))
      .toEqual({ nextDueAt: null, meterMinutesAtLast: 1234, meterJobsAtLast: 7 });
  });
  it("words the distance to due", () => {
    expect(dueText({ remaining: 1, unit: "days" })).toBe("In 1 day");
    expect(dueText({ remaining: -3, unit: "jobs" })).toBe("3 jobs overdue");
    expect(dueText({ remaining: 0, unit: "hours" })).toBe("Due now");
    expect(dueText({ remaining: null, unit: "days" })).toBe("No due date");
  });
});

describe("warranty state", () => {
  it("is valid through the expiry date, expiring within the reminder window", () => {
    expect(warrantyState(null, now, 30)).toBe("UNKNOWN");
    expect(warrantyState(new Date("2027-06-01T00:00:00Z"), now, 30)).toBe("ACTIVE");
    expect(warrantyState(new Date("2026-11-10T00:00:00Z"), now, 30)).toBe("EXPIRING_SOON");
    expect(warrantyState(new Date("2026-10-24T00:00:00Z"), now, 30)).toBe("EXPIRING_SOON");
    expect(warrantyState(new Date("2026-10-23T00:00:00Z"), now, 30)).toBe("EXPIRED");
  });
});

describe("reliability", () => {
  const from = new Date("2026-10-01T00:00:00Z"), to = new Date("2026-10-11T00:00:00Z");
  it("computes availability from clipped downtime, MTTR from fault downtime and MTBF from up time", () => {
    const rows = [
      { startedAt: new Date("2026-09-30T00:00:00Z"), endedAt: new Date("2026-10-02T00:00:00Z"), faultId: "f1" },
      { startedAt: new Date("2026-10-05T00:00:00Z"), endedAt: new Date("2026-10-05T12:00:00Z"), faultId: null },
      { startedAt: new Date("2026-10-10T00:00:00Z"), endedAt: null, faultId: "f2" },
    ];
    const stats = reliability(rows, 2, from, to);
    expect(stats.downtimeMinutes).toBe((24 + 12 + 24) * 60);
    expect(stats.availability).toBeCloseTo(1 - 60 / 240);
    expect(stats.mttrMinutes).toBe(24 * 60);
    expect(stats.mtbfMinutes).toBe((240 - 60) * 60 / 2);
  });
  it("is fully available with nothing down and has no MTBF without faults", () => {
    expect(reliability([], 0, from, to)).toEqual({ availability: 1, downtimeMinutes: 0, mttrMinutes: null, mtbfMinutes: null });
  });
});
