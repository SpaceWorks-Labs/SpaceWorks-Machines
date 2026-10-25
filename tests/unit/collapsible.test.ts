import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { collapsibleKey, CollapsibleSection, defaultOpen } from "@/components/ui/collapsible";

// Children go as createElement's third argument; the cast lets the required `children` prop come from there.
const Section = CollapsibleSection as unknown as ComponentType<Record<string, unknown>>;
const render = (props: { count?: number; action?: string }) => renderToStaticMarkup(createElement(Section,
  { id: "faults", title: "Open faults", count: props.count, action: props.action ? createElement("a", { href: "/all" }, props.action) : undefined },
  createElement("p", null, "Body")));

describe("collapsible dashboard sections", () => {
  it("start open with items and collapsed when empty, with the count in the header", () => {
    expect(defaultOpen(3)).toBe(true);
    expect(defaultOpen(0)).toBe(false);
    expect(defaultOpen(undefined)).toBe(true);
    const open = render({ count: 3 });
    expect(open).toContain('aria-expanded="true"');
    expect(open).toMatch(/<div id="[^"]+" class="px-5 pb-5"><p>Body<\/p><\/div>/);
    expect(open).toContain(">3</span>");
    const empty = render({ count: 0 });
    expect(empty).toContain('aria-expanded="false"');
    expect(empty).toMatch(/<div id="[^"]+" hidden="" class="px-5 pb-5">/);
  });

  it("names the region, wires the toggle to its content, keeps actions outside the button and honours reduced motion", () => {
    const html = render({ count: 2, action: "View all" });
    expect(html).toContain('<section aria-label="Open faults"');
    const controls = html.match(/aria-controls="([^"]+)"/)?.[1];
    expect(controls && html.includes(`id="${controls}"`)).toBe(true);
    expect(html.indexOf("View all")).toBeGreaterThan(html.indexOf("</button>"));
    expect(html).toContain("min-h-11");
    expect(html).toContain("motion-reduce:transition-none");
    expect(collapsibleKey("faults")).toBe("swm:dash:faults");
  });
});
