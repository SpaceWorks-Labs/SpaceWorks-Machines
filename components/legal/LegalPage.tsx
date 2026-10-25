import { TriangleAlert } from "lucide-react";
import { LegalToc } from "./LegalToc";

/** One paragraph, or several in order. */
export type LegalSection = { id: string; title: string; body: string | string[] };

// The title block's bottom rule runs edge to edge (Figma 126:3275) while the page
// sits in the 1160px column; a border-image outset paints it without adding scroll.
const fullBleedRule = { borderImage: "linear-gradient(rgb(var(--sw-ui-line)), rgb(var(--sw-ui-line))) 0 0 1 0 / 0 0 1px 0 / 0 100vmax" };

/** Shared Privacy / Terms layout (Figma "Privacy page — desktop" 126:3231, "Terms page — desktop" 126:3390). */
export function LegalPage({ title, updated, notice, sections }: { current?: "privacy" | "terms"; title: string; updated: string; notice: string; sections: LegalSection[] }) {
  return (
    <div className="flex flex-col pb-2 sm:pb-12">
      <header style={fullBleedRule} className="flex flex-col items-start gap-4 border-b border-line pb-10 sm:pt-6">
        <p className="text-overline text-ink-muted">Legal</p>
        <h1 className="text-display-m text-ink">{title}</h1>
        <p className="text-body-ui text-ink-muted">Last updated {updated}</p>
        <div role="note" className="flex max-w-[836px] items-start gap-3.5 rounded-[16px] bg-warning-bg px-5 py-4 text-warning-fg">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
          <p className="text-body-ui">{notice}</p>
        </div>
      </header>

      <div className="grid gap-10 pt-12 md:grid-cols-[minmax(0,260px)_minmax(0,760px)] md:gap-14 lg:gap-20">
        <LegalToc sections={sections.map(({ id, title: sectionTitle }) => ({ id, title: sectionTitle }))} />
        <div className="flex min-w-0 flex-col gap-10">
          {sections.map((section) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="flex scroll-mt-[100px] flex-col gap-3">
              <h2 id={`${section.id}-title`} className="text-h3 text-ink">{section.title}</h2>
              {(Array.isArray(section.body) ? section.body : [section.body]).map((paragraph) => (
                <p key={paragraph} className="text-body text-ink-secondary">{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
