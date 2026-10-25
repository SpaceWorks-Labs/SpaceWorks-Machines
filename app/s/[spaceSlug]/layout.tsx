import Link from "next/link";
import type { Metadata } from "next";
import { loadPublicSpaceLayout } from "@/lib/views/app__s__spaceSlug__layout";
import { accentStyle } from "@/lib/theme/accent";
import { SpaceFooter } from "@/components/chrome/SiteFooter";
import { ColorModeToggle } from "@/components/chrome/ColorModeToggle";
import { buttonClasses } from "@/components/ui/button";
import { SpaceLogo } from "@/components/ui/display";

type Props = { children: React.ReactNode; params: Promise<{ spaceSlug: string }> };

export async function generateMetadata({ params }: { params: Promise<{ spaceSlug: string }> }): Promise<Metadata> {
  const { space } = await loadPublicSpaceLayout({ params });
  return {
    title: { default: space.name, template: `%s · ${space.name}` },
    description: space.description.slice(0, 160) || `${space.name} on Space Works Machines`,
    // Unlisted spaces are reachable by link but stay out of search engines.
    robots: space.visibility === "PUBLIC" ? undefined : { index: false, follow: false },
  };
}

/** Public pages carry the space's own name and accent; Space Works steps back to the footer. */
export default async function PublicSpaceLayout({ children, params }: Props) {
  const { space } = await loadPublicSpaceLayout({ params });
  return (
    <div className="sw-accent-scope flex min-h-dvh flex-col bg-canvas" style={accentStyle(space.accentColor)}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="border-b border-line bg-canvas">
        <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href={`/s/${space.slug}`} className="flex min-h-11 min-w-0 items-center gap-3 rounded-md">
            <SpaceLogo name={space.name} src={space.logoUrl} size="sm" />
            <span className="truncate text-label font-semibold text-ink">{space.name}</span>
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2">
            <ColorModeToggle />
            <Link href={`/account`} className={buttonClasses({ variant: "secondary", size: "sm" })}>Your account</Link>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
      <SpaceFooter />
    </div>
  );
}
