"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SpaceMemberStatus } from "@prisma/client";
import { decideMember, removeSpaceMember } from "@/app/actions/team";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Avatar, Chip, EmptyState } from "@/components/ui/display";

export type MakerRow = { id: string; userId: string; name: string | null; email: string | null; status: SpaceMemberStatus; joinedLabel: string };

type Decision = "approve" | "decline" | "block" | "unblock";

/** Makers: requests waiting for a machine manager first, then everyone else. */
export function MakersList({ spaceSlug, rows, canManage, total }: { spaceSlug: string; rows: MakerRow[]; canManage: boolean; total: number }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const run = (label: string, action: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        showToast(result.error ?? "That didn't work. Try again.", "error");
        return;
      }
      showToast(label, "success");
      router.refresh();
    });
  const decide = (row: MakerRow, decision: Decision, label: string) => run(label, () => decideMember({ spaceSlug, memberId: row.id, decision }));
  const pendingRows = rows.filter((row) => row.status === "PENDING");
  const others = rows.filter((row) => row.status !== "PENDING");

  const item = (row: MakerRow) => (
    <li key={row.id} className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-lg border border-line bg-panel px-4 py-3">
      <Avatar name={row.name ?? row.email} size="md" />
      <div className="flex min-w-0 flex-[1_1_200px] flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-bold text-ink">{row.name ?? "Unnamed"}</span>
          {row.status === "PENDING" ? <Chip size="sm" tone="warning">Waiting</Chip> : null}
          {row.status === "BLOCKED" ? <Chip size="sm" tone="danger">Blocked</Chip> : null}
        </span>
        <span className="truncate text-caption text-ink-muted">{row.email ? `${row.email} · ` : ""}{row.status === "PENDING" ? "Asked" : "Joined"} {row.joinedLabel}</span>
      </div>
      {canManage ? (
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {row.status === "PENDING" ? (
            <>
              <Button size="sm" variant="primary" disabled={pending} onClick={() => decide(row, "approve", "Approved")}>Approve<span className="sr-only"> {row.name}</span></Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide(row, "decline", "Declined")}>Decline<span className="sr-only"> {row.name}</span></Button>
            </>
          ) : row.status === "BLOCKED" ? (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide(row, "unblock", "Unblocked")}>Unblock<span className="sr-only"> {row.name}</span></Button>
          ) : (
            <>
              <Button size="sm" variant="quiet" disabled={pending} onClick={() => decide(row, "block", "Blocked")}>Block<span className="sr-only"> {row.name}</span></Button>
              <Button size="sm" variant="dangerQuiet" disabled={pending} onClick={() => run("Removed", () => removeSpaceMember({ spaceSlug, targetUserId: row.userId }))}>Remove<span className="sr-only"> {row.name}</span></Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );

  return (
    <section aria-labelledby="makers-title" className="flex min-w-0 flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="makers-title" className="text-h4 text-ink">Makers</h2>
        <span className="text-caption text-ink-muted">{total === rows.length ? `${total} in all` : `Showing ${rows.length} of ${total}`}</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState mood="sleepy">No makers yet. Share your public page, or invite people with the Maker role.</EmptyState>
      ) : (
        <>
          {pendingRows.length ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-overline text-ink-muted">Waiting for approval · {pendingRows.length}</h3>
              <ul className="flex flex-col gap-2">{pendingRows.map(item)}</ul>
            </div>
          ) : null}
          {others.length ? <ul className="flex flex-col gap-2">{others.map(item)}</ul> : null}
        </>
      )}
    </section>
  );
}
