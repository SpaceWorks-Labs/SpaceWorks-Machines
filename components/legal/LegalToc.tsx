"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** "On this page" list (Figma 126:3286): highlights the section currently in view. */
export function LegalToc({ sections }: { sections: Array<{ id: string; title: string }> }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const targets = sections.map((section) => document.getElementById(section.id)).filter((node): node is HTMLElement => Boolean(node));
    if (targets.length === 0 || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = sections.find((section) => visible.has(section.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-96px 0px -55% 0px" },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-labelledby="legal-toc" className="flex flex-col gap-2.5 md:sticky md:top-[100px] md:self-start">
      <p id="legal-toc" className="text-overline text-ink-muted">On this page</p>
      <ul className="flex flex-col">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={active === section.id ? "location" : undefined}
              onClick={() => setActive(section.id)}
              className={cn(
                "flex min-h-11 items-center text-body-ui underline-offset-4 transition-colors hover:text-ink hover:underline",
                active === section.id ? "text-ink" : "text-ink-secondary",
              )}
            >
              {section.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
