"use client";

import { Field, SearchInput, Dropdown } from "@/components/ui/field";

export type PoolFiltersValue = { query: string; status: string; binding: string; visibility: string };
export const DEFAULT_POOL_FILTERS: PoolFiltersValue = { query: "", status: "active", binding: "", visibility: "" };

export function PoolFilters({ value, onChange }: { value: PoolFiltersValue; onChange: (value: PoolFiltersValue) => void }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <Field label="Search stock"><SearchInput value={value.query} placeholder="Material, colour, brand or lot" onClear={() => onChange({ ...value, query: "" })} onChange={(event) => onChange({ ...value, query: event.target.value })} /></Field>
    <Field label="Stock status"><Dropdown value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value })}>
      <option value="active">Active pools</option><option value="low">Low stock</option><option value="retired">Retired pools</option><option value="">All pools</option>
    </Dropdown></Field>
    <Field label="Binding"><Dropdown value={value.binding} onChange={(event) => onChange({ ...value, binding: event.target.value })}>
      <option value="">All bindings</option><option value="machine">Machine</option><option value="type">Machine type</option><option value="shared">Shared</option>
    </Dropdown></Field>
    <Field label="Visibility"><Dropdown value={value.visibility} onChange={(event) => onChange({ ...value, visibility: event.target.value })}>
      <option value="">All visibility</option><option value="public">Public</option><option value="staff">Staff only</option>
    </Dropdown></Field>
  </div>;
}
