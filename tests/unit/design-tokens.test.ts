import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokens = readFileSync("app/styles/tokens.css", "utf8");
const globals = readFileSync("app/globals.css", "utf8");
const semantic = readFileSync("app/styles/semantic.css", "utf8");

describe("design tokens", () => {
  it("re-emits the kit with an --sw- prefix and no Tailwind --color-* names", () => {
    expect(tokens).toMatch(/--sw-color-accent: 0 110 99;/);
    expect(tokens).toContain(":root.dark {");
    expect(tokens).not.toMatch(/^\s*--color-/m);
  });

  it("removes Tailwind's default palette and maps every role onto the kit", () => {
    expect(globals).toContain("--color-*: initial;");
    expect(globals).toMatch(/--color-primary: rgb\(var\(--sw-ui-primary\)\);/);
    expect(globals).toMatch(/--radius-control: 9999px;/);
  });

  it("never follows the operating-system colour scheme", () => {
    for (const css of [tokens, globals, semantic]) expect(css).not.toContain("prefers-color-scheme");
  });

  it("serves only the free Gilroy weights", () => {
    const faces = [...globals.matchAll(/src: url\("\/brand\/fonts\/([^"]+)"\)/g)].map((match) => match[1]);
    expect(faces).toEqual(["Gilroy-Light.woff2", "Gilroy-ExtraBold.woff2", "Unbounded-Variable.woff2"]);
  });
});
