import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { SPACE_WORKS_LOGO_ARTWORK, SpaceWorksProductLogo, SpaceWorksLogo, spaceWorksLogoSize, spaceWorksLogoSrc, type SpaceWorksLogoTone, type SpaceWorksLogoVariant } from "@/components/brand/SpaceWorksLogo";

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const images = (html: string) => [...html.matchAll(/<img src="([^"]+)" alt="" width="(\d+)" height="(\d+)"/g)].map(([, src, width, height]) => ({ src, width: Number(width), height: Number(height) }));

describe("SpaceWorksLogo", () => {
  it("maps every variant and tone to an unaltered master in public/brand/logo", () => {
    const variants: SpaceWorksLogoVariant[] = ["symbol", "lockup-horizontal", "lockup-stacked"];
    const tones: SpaceWorksLogoTone[] = ["full", "reversed", "ink"];
    for (const variant of variants) {
      for (const tone of tones) {
        const src = spaceWorksLogoSrc(variant, tone);
        const file = path.join(process.cwd(), "public", src);
        expect(existsSync(file), src).toBe(true);
        const { width, height } = SPACE_WORKS_LOGO_ARTWORK[variant];
        expect(readFileSync(file, "utf8")).toContain(`viewBox="0 0 ${width} ${height}"`);
      }
    }
    expect(spaceWorksLogoSrc("symbol", "ink")).toBe("/brand/logo/symbol-one-colour-ink.svg");
    expect(spaceWorksLogoSrc("app-icon", "reversed")).toBe("/brand/logo/app-icon.svg");
  });

  it("is one image named Space Works, or decorative when labelled null", () => {
    const html = render(createElement(SpaceWorksLogo, { variant: "symbol" }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Space Works"');
    const decorative = render(createElement(SpaceWorksLogo, { variant: "symbol", label: null }));
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain("role=");
  });

  it("never draws the symbol under 48px or a lockup under 180px wide", () => {
    expect(spaceWorksLogoSize("symbol", 20).height).toBe(48);
    expect(spaceWorksLogoSize("lockup-horizontal", 10).width).toBeGreaterThanOrEqual(180);
    expect(spaceWorksLogoSize("lockup-stacked", 10).width).toBeGreaterThanOrEqual(180);
    expect(spaceWorksLogoSize("app-icon", 16)).toEqual({ width: 16, height: 16 });
    const [image] = images(render(createElement(SpaceWorksLogo, { variant: "symbol", height: 12 })));
    expect(image!.height).toBe(48);
    expect(image!.width).toBe(Math.round((48 * 136) / 126));
  });

  it("renders a reversed twin for dark mode at the same size, unless the tone is fixed", () => {
    const pair = images(render(createElement(SpaceWorksLogo, { variant: "lockup-horizontal", height: 40 })));
    expect(pair.map((image) => image.src)).toEqual(["/brand/logo/lockup-horizontal.svg", "/brand/logo/lockup-horizontal-reversed.svg"]);
    expect(pair[0]!.width).toBe(pair[1]!.width);
    expect(pair[0]!.height).toBe(pair[1]!.height);
    expect(images(render(createElement(SpaceWorksLogo, { variant: "symbol", adaptive: false })))).toHaveLength(1);
    expect(images(render(createElement(SpaceWorksLogo, { variant: "symbol", tone: "reversed" })))).toHaveLength(1);
  });

  it("adds clear space of a quarter of the logo height when asked", () => {
    expect(render(createElement(SpaceWorksLogo, { variant: "symbol", height: 48, clearSpace: true }))).toContain("padding:12px");
  });

  it("pairs the lockup with an Machines label for product headers", () => {
    const html = render(createElement(SpaceWorksProductLogo, {}));
    expect(html).toContain('aria-label="Space Works Machines"');
    expect(html).toContain(">Machines</span>");
    expect(images(html)[0]!.width).toBeGreaterThanOrEqual(180);
  });
});

describe("BrandLoader", () => {
  it("announces its label and holds still under reduced motion", () => {
    const html = render(createElement(BrandLoader, { label: "Loading members" }));
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading members");
    expect(html.match(/sw-dot-loader-jump/g)).toHaveLength(3);
    expect(html).not.toMatch(/animate-bounce/);
  });
});
