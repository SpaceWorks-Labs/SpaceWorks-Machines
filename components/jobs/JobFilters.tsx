import { Button } from "@/components/ui/button";
import { Field, Dropdown, Input } from "@/components/ui/field";
import { words } from "@/lib/jobs/presentation";
import type { JobFilters as Filters } from "@/lib/views/app__dashboard__spaceSlug__jobs__page";

export function JobFilters({ types, machines, filters }: { types: { id: string; name: string }[]; machines: { id: string; name: string }[]; filters: Filters }) {
  return <form className="grid items-end gap-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-2 lg:grid-cols-5">
    <Field label="Type"><Dropdown name="type" defaultValue={filters.type ?? ""}><option value="">All types</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Dropdown></Field>
    <Field label="Machine"><Dropdown name="machine" defaultValue={filters.machine ?? ""}><option value="">All machines</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Dropdown></Field>
    <Field label="Requester"><Input name="requester" defaultValue={filters.requester ?? ""} maxLength={254} placeholder="Name or email" /></Field>
    <Field label="Payment state"><Dropdown name="payment" defaultValue={filters.payment ?? ""}><option value="">All payments</option>{["NOT_REQUIRED", "QUOTED", "PENDING", "PARTIALLY_PAID", "PAID", "WAIVED", "REFUNDED", "PARTIALLY_REFUNDED"].map((v) => <option key={v} value={v}>{words(v)}</option>)}</Dropdown></Field>
    <Button type="submit" variant="secondary">Apply filters</Button>
  </form>;
}
