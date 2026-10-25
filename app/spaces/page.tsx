import Link from "next/link";
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { loadSpacesDirectory } from "@/lib/views/app__spaces__page";
import { JOIN_POLICY_LABELS } from "@/lib/joinPolicy";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState, SpaceLogo } from "@/components/ui/display";

export const metadata: Metadata = { title: "Spaces", description: "Find a makerspace and join it." };

export default async function SpacesDirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q, page, pages, total, spaces } = await loadSpacesDirectory({ searchParams });
  const link = (target: number) => `/spaces?${new URLSearchParams({ ...(q ? { q } : {}), page: String(target) })}`;
  return (
    <div className="flex flex-col gap-8">
      <header className="flex max-w-[680px] flex-col gap-3">
        <h1 className="text-display-m text-ink">Find your space.</h1>
        <p className="text-body-l text-ink-secondary">Makerspaces, fab labs and workshops on this platform. Open one to see how to join and use its machines.</p>
      </header>
      <form role="search" className="flex max-w-[560px] gap-2" action="/spaces">
        <label htmlFor="space-search" className="sr-only">Search spaces</label>
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input id="space-search" name="q" defaultValue={q} placeholder="Name, kind or city" className="min-h-11 w-full rounded-control border border-line-strong bg-panel pl-10 pr-4 text-base text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))]" />
        </div>
        <button type="submit" className={buttonClasses({ variant: "primary" })}>Search</button>
      </form>

      {spaces.length === 0 ? (
        <EmptyState {...(q ? { mood: "sleepy" as const } : { patch: true })} title={q ? "Nothing matches" : "No public spaces yet"}>
          {q ? "Try a shorter search." : "Spaces appear here once the platform lists them."}
        </EmptyState>
      ) : (
        <>
          <p className="text-caption text-ink-muted">{total} {total === 1 ? "space" : "spaces"}</p>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map((space) => (
              <li key={space.slug}>
                <Link href={`/s/${space.slug}`} className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-line-strong hover:bg-subtle">
                  <div className="flex items-center gap-3">
                    <SpaceLogo name={space.name} src={space.logoUrl} size="md" />
                    <div className="min-w-0">
                      <h2 className="truncate text-h4 text-ink" title={space.name}>{space.name}</h2>
                      <p className="truncate text-caption text-ink-muted">{[space.city, space.region, space.country].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  {space.description ? <p className="line-clamp-3 text-body-ui text-ink-secondary">{space.description}</p> : null}
                  <p className="mt-auto text-caption font-semibold text-ink">{JOIN_POLICY_LABELS[space.joinPolicy]}</p>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-ink-muted">Page {page} of {pages}</span>
              <span className="flex gap-2">
                {page > 1 ? <Link href={link(page - 1)} className={buttonClasses({ variant: "secondary", size: "sm" })}>Previous</Link> : null}
                {page < pages ? <Link href={link(page + 1)} className={buttonClasses({ variant: "secondary", size: "sm" })}>Next</Link> : null}
              </span>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
