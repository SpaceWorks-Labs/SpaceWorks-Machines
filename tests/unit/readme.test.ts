import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readme = readFileSync("README.md", "utf8");

describe("README", () => {
  it("links only to files that exist", () => {
    const targets = [...readme.matchAll(/(?:href|src|srcset)="([^"#]+)"|\]\(([^)#\s]+)\)/g)].map((match) => match[1] ?? match[2]!)
      .filter((target) => !/^(https?:|mailto:)/.test(target));
    expect(targets.length).toBeGreaterThan(20);
    for (const target of targets) expect(existsSync(target), target).toBe(true);
  });
  it("shows every screenshot in light mode with its dark counterpart on disk", () => {
    const shots = [...readme.matchAll(/docs\/screenshots\/([a-z-]+)\.png/g)].map((match) => match[1]!);
    expect(shots.length).toBeGreaterThanOrEqual(10);
    for (const name of shots) expect(existsSync(`docs/screenshots/${name}-dark.png`), name).toBe(true);
  });
  it("has the banner in both modes and the sections the family READMEs share", () => {
    expect(readme).toContain('srcset="docs/readme/banner-dark.png"');
    expect(readme).toContain("(docs/DECISIONS.md)");
    for (const heading of ["## What you can do", "## A look around", "## Host it on a VPS with Docker", "### Install in one line", "## Run it in the cloud",
      "## Quick start (local)", "## Design system", "## Documentation", "## Common commands", "## Contributing", "## Credits", "## Licence"]) expect(readme).toContain(heading);
  });
});
