import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const windowsBash = "C:/Program Files/Git/bin/bash.exe";
const bash = process.platform === "win32" && existsSync(windowsBash) ? windowsBash : "bash";

function build(layer: string, status = 0) {
  const root = mkdtempSync(join(tmpdir(), "swm-edge-build-"));
  try {
    const file = join(root, "fixture.env");
    writeFileSync(file, `SWM_LAYER='${layer}'\n`);
    return spawnSync(bash, ["-s"], {
      encoding: "utf8", timeout: 15_000,
      env: { NODE_ENV: "test", PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, SWM_STATIC_ENV_FILE: file },
      input: `set -euo pipefail
source scripts/spaceworks-repository.sh
compose() { printf '%s\\n' "$*"; return ${status}; }
COMPOSE=(compose)
build_web_edge
`,
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

describe("locally built production web edge", () => {
  it.each(["none", "tls", ""])("builds the edge for bundled mode %j without pulling an unpublished image", (layer) => {
    const result = build(layer);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("build caddy");
  });

  it("does not invoke Docker for an installation behind its own proxy", () => {
    const result = build("proxy");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("stops installation when its edge build fails", () => {
    expect(build("tls", 23).status).toBe(23);
  });
});
