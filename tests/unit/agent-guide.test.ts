import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("agent guide", () => {
  it("keeps CLAUDE.md byte-identical to AGENTS.md", () => {
    expect(readFileSync("CLAUDE.md")).toEqual(readFileSync("AGENTS.md"));
  });
  it("starts agents at docs/DECISIONS.md, which replaced the handoff", () => {
    expect(readFileSync("AGENTS.md", "utf8")).toContain("**Start here:** `docs/DECISIONS.md`");
    expect(existsSync("docs/DECISIONS.md")).toBe(true);
    expect(existsSync("docs/HANDOFF.md")).toBe(false);
  });
});
