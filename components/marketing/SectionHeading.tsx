import { cn } from "@/lib/cn";

/** A two-line full-stop heading and its lead paragraph, rising into view as the section scrolls in. */
export function SectionHeading({ id, title, children, inverse = false }: { id: string; title: React.ReactNode; children?: React.ReactNode; inverse?: boolean }) {
  return (
    <div className="flex max-w-[620px] flex-col gap-4">
      <h2 id={id} className={cn("sr-rise text-display-m text-balance", inverse ? "text-sw-cream" : "text-ink")}>{title}</h2>
      {children ? <p className={cn("sr-fade text-body-l", inverse ? "text-sw-cream/80" : "text-ink-secondary")}>{children}</p> : null}
    </div>
  );
}

