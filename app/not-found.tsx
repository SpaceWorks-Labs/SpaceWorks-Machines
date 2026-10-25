import Link from "next/link";
import type { Metadata } from "next";
import { NotFoundPet } from "@/components/feedback/NotFoundPet";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

/** Patch, trotting along the bottom, is this page's one bold moment. */
export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 pb-40 pt-16 text-center">
      <NotFoundPet />
      <p className="text-label text-ink-muted">404</p>
      <h1 className="text-h2 text-ink">We couldn&rsquo;t find that page</h1>
      <p className="text-body text-ink-secondary">The link may be old, or the page may have moved. Check the address, or start again from the home page.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonClasses({ variant: "primary" })}>Go to the home page</Link>
        <Link href="/spaces" className={buttonClasses({ variant: "secondary" })}>Find a space</Link>
      </div>
      <p className="text-caption text-ink-muted">Patch is out looking for it too.</p>
    </main>
  );
}
