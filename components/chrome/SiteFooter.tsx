"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { SpaceWorksProductLogo, SpaceWorksLogo } from "@/components/brand/SpaceWorksLogo";
import { GITHUB_URL, LICENSE_URL } from "@/lib/openSource";

const publicLinks = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Spaces", href: "/spaces" },
  { label: "Self-host", href: "/#self-host" },
  { label: "Apply", href: "/start" },
  { label: "About", href: "/about" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

const linkClasses = "inline-flex min-h-11 items-center text-body-ui text-ink-secondary underline-offset-4 transition-colors hover:text-ink hover:underline";
const creditLinkClasses = "inline-flex min-h-11 items-center underline underline-offset-4 hover:text-ink";

/** Who runs this instance, e.g. "Shaan Shoukath, Systems Engineer". Inlined at build time; empty hides it. */
const HOSTED_BY = process.env.NEXT_PUBLIC_HOSTED_BY?.trim() ?? "";

/** "Powered by Space Works" plus the AGPL source link (the licence asks every install to offer its source). */
function SourceCredit() {
  return (
    <>
      {HOSTED_BY ? (
        <>
          <span>Hosted by {HOSTED_BY}</span>
          <span aria-hidden>·</span>
        </>
      ) : null}
      <span>Powered by Space Works</span>
      <span aria-hidden>·</span>
      <span>
        Open source under{" "}
        <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className={creditLinkClasses}>AGPL-3.0</a>
      </span>
      <span aria-hidden>·</span>
      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={creditLinkClasses}>Source code</a>
    </>
  );
}

/** Space Works Machines site footer (Figma 121:1333). */
export function SiteFooter() {
  const pathname = usePathname();
  const { status } = useSession();
  const links = status === "authenticated" ? [{ label: "Dashboard", href: "/dashboard" }, { label: "Account", href: "/account" }, ...publicLinks] : publicLinks;

  return (
    <footer className="mt-auto border-t border-line bg-canvas">
      <div className="mx-auto flex max-w-[1160px] flex-col gap-5 px-4 py-10 sm:px-6 xl:px-0">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2.5">
            <Link href="/" className="inline-flex min-h-11 items-center self-start" aria-label="Space Works Machines home">
              <SpaceWorksProductLogo height={32} label={null} />
            </Link>
            <p className="text-body-ui text-ink-secondary">Machines, jobs and upkeep for the spaces where things get made.</p>
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6">
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={linkClasses}>
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={linkClasses}>GitHub</a>
              </li>
            </ul>
          </nav>
        </div>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-line pt-5 text-caption text-ink-muted">
          <SourceCredit />
        </p>
      </div>
    </footer>
  );
}

/** Compact footer for a space's public pages: the space leads, Space Works steps back. */
export function SpaceFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-canvas">
      <div className="mx-auto flex max-w-[1160px] flex-col gap-3 px-4 py-6 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 self-start hover:text-ink">
          <SpaceWorksLogo variant="app-icon" height={18} label={null} />
          <span>Powered by Space Works</span>
        </Link>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <Link href="/privacy" className={creditLinkClasses}>Privacy</Link>
          <span aria-hidden>·</span>
          <Link href="/terms" className={creditLinkClasses}>Terms</Link>
          <span aria-hidden>·</span>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={creditLinkClasses}>Source code</a>
        </p>
      </div>
    </footer>
  );
}
