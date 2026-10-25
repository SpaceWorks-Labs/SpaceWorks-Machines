export function MachineSpecs({ rows }: { rows: { key: string; label: string; value: string }[] }) {
  return <dl className="grid gap-3 text-body-ui">
    {rows.map((row) => <div key={row.key} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-line pb-2 last:border-0 last:pb-0">
      <dt className="text-ink-secondary">{row.label}</dt>
      <dd className="break-words text-ink">{row.value}</dd>
    </div>)}
  </dl>;
}
