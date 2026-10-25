import Link from "next/link";
import type { ReactNode } from "react";
import { SpaceLogo } from "@/components/ui/display";

/**
 * Compact header for a space's sub-pages (Members, Settings):
 * logo, "Space / Page" breadcrumb, title, one-line description and actions.
 */
export function SpacePageHeader({
  space,
  title,
  description,
  actions,
}: {
  space: { name: string; slug: string; logoUrl: string | null };
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <SpaceLogo name={space.name} src={space.logoUrl} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm text-ink-muted">
          <Link href={`/dashboard/${space.slug}`} className="underline-offset-4 hover:text-ink hover:underline">
            {space.name}
          </Link>
          <span aria-hidden> / </span>
          <span aria-current="page">{title}</span>
        </p>
        <h1 className="break-words text-h1 text-ink">{title}</h1>
        {description ? <p className="text-body-ui text-ink-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  );
}
