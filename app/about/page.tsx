import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { BuildingNote } from "@/components/about/BuildingNote";
import { buttonClasses } from "@/components/ui/button";
import { GITHUB_URL } from "@/lib/openSource";

export const metadata: Metadata = {
  title: "About",
  description: "Who builds Space Works Machines, and why it exists.",
};

/** About: the team's note in an airmail envelope. Its Unbounded title and orange seal are the page's one bold moment. */
export default function AboutPage() {
  return (
    <div className="flex flex-col gap-20 lg:gap-28">
      <section aria-labelledby="about-title" className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
        <div className="flex max-w-[600px] flex-col gap-5">
          <p className="text-label text-ink-muted">About</p>
          <h1 id="about-title" className="text-display-m text-ink">Built by people who keep the machines running too.</h1>
          <p className="text-body-l text-ink-secondary">
            Space Works Machines is free, open-source machine management software from Space Works. It is for the people who run
            makerspaces, fab labs and college workshops: the managers, technicians and volunteers who keep the queue moving.
          </p>
          <p className="text-body-ui text-ink-muted">We wrote you a note. Open the envelope to read it.</p>
        </div>
        <BuildingNote />
      </section>

      <section aria-labelledby="open-title" className="flex flex-col items-start gap-5 border-t border-line pt-16">
        <h2 id="open-title" className="text-h2 text-ink">Read it, run it, help shape it</h2>
        <p className="max-w-[60ch] text-body-ui text-ink-secondary">
          The code is open under the AGPL. Run it for one workshop or a whole network of spaces, and tell us what your floor needs next.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href={GITHUB_URL} className={buttonClasses({ variant: "primary" })}>
            View on GitHub
            <ArrowUpRight aria-hidden className="size-4" />
          </a>
          <Link href="/start" className={buttonClasses({ variant: "secondary" })}>Apply for your space</Link>
        </div>
      </section>
    </div>
  );
}
