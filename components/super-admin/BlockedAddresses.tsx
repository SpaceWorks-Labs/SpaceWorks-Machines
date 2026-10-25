"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { unblockAddress } from "@/app/actions/ip-blocks";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

/** Addresses blocked after repeated failed sign-ins, with a way to lift each block early. */
export function BlockedAddresses({ rows }: { rows: Array<{ ip: string; blocked: string; until: string }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (rows.length === 0) return <EmptyState mood="sleepy">No addresses are blocked right now.</EmptyState>;
  return (
    <Table label="Blocked addresses">
      <THead>
        <tr>
          <TH>Address</TH>
          <TH>Blocked</TH>
          <TH>Until</TH>
          <TH className="text-right">Action</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.ip}>
            <TD className="tabular-nums">{row.ip}</TD>
            <TD className="text-ink-secondary">{row.blocked}</TD>
            <TD className="text-ink-secondary">{row.until}</TD>
            <TD className="text-right">
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => startTransition(async () => { await unblockAddress({ ip: row.ip }); router.refresh(); })}>Unblock</Button>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
