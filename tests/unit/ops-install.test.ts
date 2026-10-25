import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("install.sh", "utf8");
const run = (...args: string[]) => spawnSync("bash", ["install.sh", ...args], { encoding: "utf8", timeout: 20_000 });

describe("install.sh", () => {
  it("documents --ref and the private-repository fallbacks in --help", () => {
    const help = run("--help");
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("--ref REF");
    expect(help.stdout).toContain("GITHUB_TOKEN");
    expect(help.stdout).toContain("gh api");
  });
  it.each(["../etc", "a..b", "-rf", "bad ref", "x".repeat(101)])("refuses the ref %j before touching the host", (ref) => {
    const result = run("--ref", ref);
    expect(result.status).toBe(64);
    expect(result.stderr).toMatch(/--ref takes a branch, tag or commit name|Usage/);
  });
  it("refuses unknown options", () => {
    expect(run("--bogus").status).toBe(64);
  });
  it("builds a ref from source (archive or token tarball) and installs releases from their tag", () => {
    expect(script).toContain('fetch "https://github.com/$REPOSITORY/archive/$SOURCE_REF.tar.gz"');
    expect(script).toContain('"https://api.github.com/repos/$REPOSITORY/tarball/$SOURCE_REF"');
    expect(script).toContain("SWM_IMAGE_TAG=local bash setup.sh --build");
    expect(script).toContain('fetch "https://github.com/$REPOSITORY/archive/refs/tags/$RELEASE_TAG.tar.gz"');
    expect(script).toContain('--ref installs fresh only');
  });
  it("is LF-only so it runs from curl | bash", () => {
    expect(script.includes("\r\n")).toBe(false);
  });
});
