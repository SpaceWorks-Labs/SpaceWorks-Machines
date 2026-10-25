import type { ReactNode } from "react";
import type { SpaceRole } from "@prisma/client";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui/display";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissionRoles";
import { DOT_TONES, ROLE_TONES } from "@/components/team/roleTones";

/* ---------- Stats ---------- */

export function MemberStat({ label, value, hint, dots }: { label: string; value: ReactNode; hint: ReactNode; dots?: SpaceRole[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-line bg-panel px-5 py-4">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="flex min-w-0 items-end justify-between gap-3">
        <span className="font-display text-[34px] font-semibold leading-none text-ink">{value}</span>
        {dots && dots.length > 0 ? (
          <span aria-hidden className="flex min-w-0 flex-wrap justify-end gap-1 pb-1">
            {dots.map((role, index) => (
              <span key={index} className={cn("size-[9px] rounded-full", DOT_TONES[role])} />
            ))}
          </span>
        ) : null}
      </span>
      <span className="truncate text-caption text-ink-muted" title={typeof hint === "string" ? hint : undefined}>{hint}</span>
    </div>
  );
}

/* ---------- Roles ---------- */

const ROLE_ORDER: SpaceRole[] = ["MACHINE_MANAGER", "TYPE_MANAGER", "OPERATOR", "TECHNICIAN", "VIEWER", "MEMBER"];

export function RolesCard() {
  return (
    // Reference, not a task: folded until someone opens it, and remembered per browser.
    <CollapsibleSection id="team-roles" title="What each role can do" startOpen={false} className="min-w-0">
      <dl className="flex flex-col gap-3">
        {ROLE_ORDER.map((role) => (
          <div key={role} className="flex flex-col gap-1">
            <dt>
              <Chip size="sm" tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</Chip>
            </dt>
            <dd className="min-w-0 text-body-ui text-ink-secondary">{ROLE_DESCRIPTIONS[role]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-caption text-ink-muted">Everyone except makers needs an authenticator app before the dashboard opens.</p>
    </CollapsibleSection>
  );
}
