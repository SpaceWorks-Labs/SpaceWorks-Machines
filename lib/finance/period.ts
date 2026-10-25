/**
 * Finance periods in the space's time zone: a day, a week (Monday first), a month or a financial year
 * (1 April to 31 March). Client-safe and pure; `anchor` is a local YYYY-MM-DD inside the period.
 */
export const PERIOD_KINDS = ["day", "week", "month", "year"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

type Ymd = { y: number; m: number; d: number };
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (v: Ymd) => `${v.y}-${pad(v.m)}-${pad(v.d)}`;
const fromUtc = (date: Date): Ymd => ({ y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() });
const civil = (v: Ymd) => new Date(Date.UTC(v.y, v.m - 1, v.d));
const addDays = (v: Ymd, days: number) => fromUtc(new Date(civil(v).getTime() + days * 86_400_000));

/** The local calendar date of an instant in a time zone. */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/** The instant a local day starts in a time zone (handles offsets and DST by correcting once). */
export function zonedStart(day: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!);
  const offset = (at: number) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(new Date(at)).reduce<Record<string, number>>((acc, p) => (p.type === "literal" ? acc : { ...acc, [p.type]: Number(p.value) }), {});
    return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!) - at;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

/** Financial years are named by the calendar year they start in: "FY 2026-27" runs 1 Apr 2026 to 31 Mar 2027. */
export function financePeriod(kind: PeriodKind, anchor: string | null | undefined, timeZone: string, now = new Date()) {
  const valid = typeof anchor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(anchor) && !Number.isNaN(Date.parse(`${anchor}T00:00:00Z`));
  const [y, m, d] = (valid ? anchor! : localDate(now, timeZone)).split("-").map(Number) as [number, number, number];
  const day: Ymd = { y, m, d };
  let start: Ymd, end: Ymd, label: string;
  if (kind === "day") { start = day; end = addDays(day, 1); label = ymd(day); }
  else if (kind === "week") {
    const weekday = (civil(day).getUTCDay() + 6) % 7;
    start = addDays(day, -weekday); end = addDays(start, 7); label = `Week of ${ymd(start)}`;
  } else if (kind === "month") {
    start = { y, m, d: 1 }; end = m === 12 ? { y: y + 1, m: 1, d: 1 } : { y, m: m + 1, d: 1 };
    label = civil(start).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  } else {
    const first = m >= 4 ? y : y - 1;
    start = { y: first, m: 4, d: 1 }; end = { y: first + 1, m: 4, d: 1 }; label = `FY ${first}-${String(first + 1).slice(2)}`;
  }
  const previous = kind === "day" ? addDays(start, -1) : kind === "week" ? addDays(start, -7) : kind === "month" ? addDays(start, -1) : { y: start.y - 1, m: 4, d: 1 };
  return { kind, label, from: zonedStart(ymd(start), timeZone), to: zonedStart(ymd(end), timeZone), anchor: ymd(start),
    previous: ymd(previous), next: ymd(end) };
}
