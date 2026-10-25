/** Report kinds and the date range they cover. Client-safe. */

const DAY = 86_400_000;
export const REPORT_KINDS = ["jobs", "utilisation", "consumables", "revenue", "maintenance", "warranty", "spend", "repairs"] as const;
/** Reports that are money: the machine manager's only (owner decision 2026-10-24). */
export const MONEY_REPORTS: readonly string[] = ["revenue", "spend", "repairs"];
export type ReportKind = typeof REPORT_KINDS[number];

/** `from`/`to` as YYYY-MM-DD (UTC days, `to` inclusive); defaults to the last 30 days; at most two years. */
export function reportRange(from?: string | null, to?: string | null, now = new Date()) {
  const parse = (value?: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  const end = parse(to) ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let start = parse(from) ?? new Date(end.getTime() - 29 * DAY);
  if (Number.isNaN(start.getTime()) || start > end) start = new Date(end.getTime() - 29 * DAY);
  if (end.getTime() - start.getTime() > 731 * DAY) start = new Date(end.getTime() - 731 * DAY);
  return { from: start, to: new Date(end.getTime() + DAY), fromInput: start.toISOString().slice(0, 10), toInput: end.toISOString().slice(0, 10) };
}
