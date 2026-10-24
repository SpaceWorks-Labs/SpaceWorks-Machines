"use client";

import { Button } from "@/components/ui/button";
import { Dropdown, Field, Input } from "@/components/ui/field";

/**
 * GET filter forms for server pages. They live in a client module so each Field receives a real element as its
 * child (a client component passed across the server/client boundary can arrive as a lazy reference).
 */

const words = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");

export function PaymentFilters({ status, method }: { status: string; method: string }) {
  return (
    <form className="flex flex-wrap items-end gap-3" aria-label="Filter payments">
      <Field label="Status"><Dropdown name="status" defaultValue={status}><option value="">All statuses</option>
        {["PENDING", "PAID", "FAILED", "CANCELLED", "WAIVED"].map((v) => <option key={v} value={v}>{words(v)}</option>)}</Dropdown></Field>
      <Field label="Method"><Dropdown name="method" defaultValue={method}><option value="">All methods</option>
        {["RAZORPAY", "STRIPE", "CASH", "BANK_TRANSFER", "UPI", "CARD_TERMINAL", "OTHER"].map((v) => <option key={v} value={v}>{words(v)}</option>)}</Dropdown></Field>
      <Button type="submit" variant="secondary">Apply filters</Button>
    </form>
  );
}

export function DateRangeForm({ from, to, label, submit }: { from: string; to: string; label: string; submit: string }) {
  return (
    <form className="flex flex-wrap items-end gap-3" aria-label={label}>
      <Field label="From"><Input type="date" name="from" defaultValue={from} /></Field>
      <Field label="To"><Input type="date" name="to" defaultValue={to} /></Field>
      <Button type="submit" variant="secondary">{submit}</Button>
    </form>
  );
}

export function AuditFilters({ filters, people, areas }: { filters: { actor: string; area: string; from: string; to: string };
  people: { id: string; name: string }[]; areas: Record<string, string> }) {
  return (
    <form className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filter the audit log">
      <Field label="Person"><Dropdown name="actor" defaultValue={filters.actor}><option value="">Everyone</option>
        {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</Dropdown></Field>
      <Field label="Area"><Dropdown name="area" defaultValue={filters.area}><option value="">Every area</option>
        {Object.entries(areas).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</Dropdown></Field>
      <Field label="From"><Input type="date" name="from" defaultValue={filters.from} /></Field>
      <Field label="To"><Input type="date" name="to" defaultValue={filters.to} /></Field>
      <Button type="submit" variant="secondary">Filter</Button>
    </form>
  );
}
