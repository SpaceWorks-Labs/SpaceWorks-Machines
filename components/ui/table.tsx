import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Rounded (16px), bordered table with 48px rows that scrolls inside its own box on small screens (docs/DESIGN.md §4.8).
 * `long` caps the height for lists that grow without end (ledgers, logs), so the header row stays pinned while the
 * rows scroll. Cells keep separate borders so the pinned header carries its own bottom line.
 */
export function Table({ className, children, label, long = false, ...props }: HTMLAttributes<HTMLTableElement> & { label?: string; long?: boolean }) {
  return (
    <div className={cn("relative w-full overflow-x-auto rounded-xl border border-line bg-panel", long && "max-h-[min(70vh,720px)] overflow-y-auto")} role="region" aria-label={label} tabIndex={label ? 0 : undefined}>
      <table className={cn("w-full border-separate border-spacing-0 text-left text-body-ui", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("sticky top-0 z-[1] bg-surface", className)} {...props} />;
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&>tr:last-child>td]:border-b-0", className)} {...props} />;
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors duration-[120ms] hover:bg-subtle", className)} {...props} />;
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("h-12 whitespace-nowrap border-b border-line bg-surface px-4 py-2 text-sm font-semibold text-accent-text", className)} {...props} />;
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("h-12 border-b border-line px-4 py-2.5 align-middle text-ink", className)} {...props} />;
}

/** A cell for long free text (names, notes, hosts): one line, cut with an ellipsis, the whole text in its title. */
export function TruncatedTD({ text, className, ...props }: Omit<TdHTMLAttributes<HTMLTableCellElement>, "children" | "title"> & { text: string }) {
  return <TD className={cn("max-w-[16rem] truncate", className)} title={text} {...props}>{text}</TD>;
}
