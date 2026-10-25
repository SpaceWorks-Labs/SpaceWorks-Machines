"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/** The key a dashboard section's open or closed choice is kept under, per browser. */
export const collapsibleKey = (id: string) => `swm:dash:${id}`;

/** Open when the section has something in it, collapsed when it's empty; no count means open. */
export function defaultOpen(count: number | undefined) {
  return count === undefined || count > 0;
}

/** This visit's choices, for browsers that block storage (private windows, blocked site data). */
const visit = new Map<string, boolean>();
const listeners = new Set<() => void>();

function readChoice(key: string): boolean | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === "1" || stored === "0") return stored === "1";
  } catch { /* fall back to this visit's choice */ }
  return visit.get(key) ?? null;
}

function saveChoice(key: string, open: boolean) {
  visit.set(key, open);
  try { window.localStorage.setItem(key, open ? "1" : "0"); } catch { /* the choice lasts for this visit only */ }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}

/**
 * An open/closed state remembered per browser under `storageKey`. The stored choice is read only on the client
 * (the server snapshot is "no choice"), so the server and the first client render agree; until then, and
 * without a choice, it is `fallback`.
 */
export function useRememberedOpen(storageKey: string, fallback: boolean): [boolean, (open: boolean) => void] {
  const stored = useSyncExternalStore(subscribe, () => readChoice(storageKey), () => null);
  return [stored ?? fallback, (open: boolean) => saveChoice(storageKey, open)];
}

/** The header toggle: a full-width button with the title, an optional count and a chevron that turns when open. */
export function CollapsibleToggle({ open, onToggle, controls, children, count, className }: {
  open: boolean; onToggle: () => void; controls: string; children: ReactNode; count?: number; className?: string;
}) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls}
      className={cn("flex min-h-11 w-full items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink", className)}>
      <span className="min-w-0 flex-1">{children}</span>
      {count !== undefined ? <span className="rounded-full border border-line bg-surface px-2 text-caption font-semibold text-ink-secondary">{count}</span> : null}
      <ChevronDown aria-hidden className={cn("size-5 shrink-0 text-ink-muted transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
    </button>
  );
}

/**
 * A section card whose header (title, optional count) opens and closes it. Empty sections start collapsed;
 * a person's choice is remembered in this browser. Any action (such as "View all") sits beside the toggle,
 * never inside it. `id` must be stable: it is the storage key.
 */
export function CollapsibleSection({ id, title, count, description, action, label, className, startOpen, children }: {
  id: string; title: ReactNode; count?: number; description?: ReactNode; action?: ReactNode;
  /** The section's accessible name (a region), when the title isn't plain text. */
  label?: string; className?: string;
  /** Overrides the count rule, for secondary sections that start folded. */
  startOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useRememberedOpen(collapsibleKey(id), startOpen ?? defaultOpen(count));
  const contentId = useId();
  return (
    <section aria-label={label ?? (typeof title === "string" ? title : undefined)} className={cn("rounded-xl border border-line bg-panel", className)}>
      <div className="flex flex-wrap items-center gap-2 pr-3">
        {/* The disclosure pattern: the heading holds the button, so the section keeps its heading. */}
        <h2 className="min-w-0 flex-1">
          <CollapsibleToggle open={open} onToggle={() => setOpen(!open)} controls={contentId} count={count} className="rounded-xl px-5 py-3">
            <span className="block text-title text-ink">{title}</span>
            {description ? <span className="mt-1 block text-body-ui font-normal text-ink-muted">{description}</span> : null}
          </CollapsibleToggle>
        </h2>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      <div id={contentId} hidden={!open} className="px-5 pb-5">{children}</div>
    </section>
  );
}
