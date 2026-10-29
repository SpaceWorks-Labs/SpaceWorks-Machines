import { safeTimeZone, zonedDatetimeLocalValue } from "@/lib/timeZone";
import { zonedStart } from "@/lib/finance/period";

export class CalendarDayError extends Error {}

/** Date-only database fields keep their calendar value, independent of server timezone. */
export function parseCalendarDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function calendarDayAt(instant: Date, timezone: string): string {
  return zonedDatetimeLocalValue(instant, safeTimeZone(timezone)).slice(0, 10);
}

/** Resolve a financial date in the authorised space, retaining the domain's future-instant guard. */
export function financialDay(value: string | undefined, timezone: string): Date | undefined {
  if (!value) return undefined;
  const day = parseCalendarDay(value);
  if (!day) throw new CalendarDayError("Choose a valid date.");
  const zone = safeTimeZone(timezone);
  const result = zonedStart(value, zone);
  if (calendarDayAt(result, zone) !== value) throw new CalendarDayError("Choose a valid date.");
  return result;
}
