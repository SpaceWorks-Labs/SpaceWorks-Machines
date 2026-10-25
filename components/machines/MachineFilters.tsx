"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Field, Dropdown } from "@/components/ui/field";
import { MACHINE_STATUSES } from "@/lib/machines/schemas";
import { MACHINE_STATUS_LABELS } from "./MachineStatusChip";

export function MachineFilters({ types, typeId, status }: { types: { id: string; name: string }[]; typeId: string; status: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  function filter(type: string, status: string) {
    const query = new URLSearchParams();
    if (type) query.set("type", type);
    if (status) query.set("status", status);
    startTransition(() => router.replace(`${pathname}${query.size ? `?${query}` : ""}`, { scroll: false }));
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-busy={pending}>
      <Field label="Machine type"><Dropdown value={typeId} disabled={pending} onChange={(event) => filter(event.target.value, status)}>
        <option value="">All types</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
      </Dropdown></Field>
      <Field label="Status"><Dropdown value={status} disabled={pending} onChange={(event) => filter(typeId, event.target.value)}>
        <option value="">All in-service machines</option>
        {MACHINE_STATUSES.map((status) => <option key={status} value={status}>{MACHINE_STATUS_LABELS[status]}</option>)}
        <option value="RETIRED">Retired</option>
      </Dropdown></Field>
    </div>
  );
}
