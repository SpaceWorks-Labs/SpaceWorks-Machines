import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A titled settings card for the account pages (title, one-line description, body). */
export function AccountCard({
  id,
  title,
  description,
  action,
  tone = "default",
  className,
  children,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "danger";
  className?: string;
  children?: ReactNode;
}) {
  const titleId = `${id}-title`;
  return (
    <section
      aria-labelledby={titleId}
      className={cn("rounded-xl border bg-panel p-5 sm:p-6", tone === "danger" ? "border-danger-border" : "border-line", className)}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={titleId} className="text-h4 text-ink">{title}</h2>
          {description ? <p className="mt-1 text-body-ui text-ink-muted">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
