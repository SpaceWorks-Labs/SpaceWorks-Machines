import type { MaintenanceTrigger } from "@prisma/client";

/** Pure maintenance and warranty maths (docs/plans/domain-behaviour.md §4). Client-safe. */

export type DueState = "OK" | "DUE_SOON" | "OVERDUE";
export type WarrantyState = "UNKNOWN" | "ACTIVE" | "EXPIRING_SOON" | "EXPIRED";

export type ScheduleShape = {
  trigger: MaintenanceTrigger;
  intervalDays: number | null;
  intervalHours: number | null;
  intervalJobs: number | null;
  nextDueAt: Date | null;
  meterMinutesAtLast: number;
  meterJobsAtLast: number;
};
export type Meters = { meterMinutes: number; meterJobs: number };

const DAY = 86_400_000;

/** How far a schedule is from due. Usage triggers count from the meters at the last completion. */
export function scheduleDue(schedule: ScheduleShape, machine: Meters, now: Date, reminderDays: number) {
  if (schedule.trigger === "TIME") {
    if (!schedule.nextDueAt) return { state: "OK" as DueState, remaining: null, unit: "days" as const };
    const remaining = Math.ceil((schedule.nextDueAt.getTime() - now.getTime()) / DAY);
    const state: DueState = schedule.nextDueAt <= now ? "OVERDUE" : schedule.nextDueAt.getTime() - now.getTime() <= reminderDays * DAY ? "DUE_SOON" : "OK";
    return { state, remaining, unit: "days" as const };
  }
  const hours = schedule.trigger === "USAGE_HOURS";
  const interval = hours ? (schedule.intervalHours ?? 0) * 60 : schedule.intervalJobs ?? 0;
  const used = hours ? machine.meterMinutes - schedule.meterMinutesAtLast : machine.meterJobs - schedule.meterJobsAtLast;
  const left = interval - used;
  // Due soon within 10 % of the interval (at least one unit), so short intervals still warn.
  const soon = Math.max(1, Math.ceil(interval / 10));
  const state: DueState = interval <= 0 ? "OK" : left <= 0 ? "OVERDUE" : left <= soon ? "DUE_SOON" : "OK";
  return { state, remaining: hours ? Math.ceil(left / 60) : left, unit: hours ? "hours" as const : "jobs" as const };
}

/** After completion: TIME advances from the old due date (never into the past), usage resets its baseline. */
export function advanceSchedule(schedule: ScheduleShape, machine: Meters, doneAt: Date) {
  if (schedule.trigger !== "TIME") return { nextDueAt: null, meterMinutesAtLast: machine.meterMinutes, meterJobsAtLast: machine.meterJobs };
  const step = (schedule.intervalDays ?? 0) * DAY;
  let next = (schedule.nextDueAt ?? doneAt).getTime() + step;
  while (step > 0 && next <= doneAt.getTime()) next += step;
  return { nextDueAt: new Date(next), meterMinutesAtLast: machine.meterMinutes, meterJobsAtLast: machine.meterJobs };
}

export function warrantyState(expiresOn: Date | null, now: Date, reminderDays: number): WarrantyState {
  if (!expiresOn) return "UNKNOWN";
  // Dates are whole days: a warranty is valid through its expiry date.
  const end = expiresOn.getTime() + DAY;
  if (end <= now.getTime()) return "EXPIRED";
  return end - now.getTime() <= reminderDays * DAY ? "EXPIRING_SOON" : "ACTIVE";
}

export type Interval = { startedAt: Date; endedAt: Date | null; faultId?: string | null };

/** Overlapping minutes of each interval inside [from, to); open intervals run to `to`. */
function clipped(rows: Interval[], from: Date, to: Date) {
  return rows.map((row) => Math.max(0, Math.min((row.endedAt ?? to).getTime(), to.getTime()) - Math.max(row.startedAt.getTime(), from.getTime())));
}

/** Availability = 1 − downtime ÷ period; MTTR over downtime caused by a fault; MTBF = up time ÷ faults. */
export function reliability(downtime: Interval[], faultCount: number, from: Date, to: Date) {
  const period = Math.max(0, to.getTime() - from.getTime());
  const spans = clipped(downtime, from, to);
  const down = Math.min(period, spans.reduce((sum, value) => sum + value, 0));
  const repairs = downtime.flatMap((row, index) => row.faultId && row.endedAt ? [spans[index]!] : []);
  return {
    availability: period === 0 ? 1 : 1 - down / period,
    downtimeMinutes: Math.round(down / 60_000),
    mttrMinutes: repairs.length ? Math.round(repairs.reduce((sum, value) => sum + value, 0) / repairs.length / 60_000) : null,
    mtbfMinutes: faultCount ? Math.round((period - down) / faultCount / 60_000) : null,
  };
}
