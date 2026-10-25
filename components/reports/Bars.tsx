/** Horizontal bars from design tokens: each row shows its label and value as text, so the chart never hides a number. */
export function Bars({ rows, format = String, label }: { rows: Array<{ label: string; value: number; display?: string }>; format?: (value: number) => string; label: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) return <p className="text-body-ui text-ink-muted">Nothing in this period.</p>;
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
          <span className="truncate text-caption text-ink-secondary" title={row.label}>{row.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true"><span className="block h-full rounded-full bg-primary" style={{ width: `${(row.value / max) * 100}%` }} /></span>
          <span className="whitespace-nowrap text-right text-caption tabular-nums text-ink">{row.display ?? format(row.value)}</span>
        </li>
      ))}
    </ul>
  );
}
