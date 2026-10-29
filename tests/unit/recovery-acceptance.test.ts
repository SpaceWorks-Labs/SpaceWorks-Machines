import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const windowsBash = "C:/Program Files/Git/bin/bash.exe";
const bash = process.platform === "win32" && existsSync(windowsBash) ? windowsBash : "bash";

function guarded(script: string, env: Record<string, string>) {
  return spawnSync(bash, [`scripts/${script}.sh`], {
    encoding: "utf8", timeout: 5_000,
    env: { NODE_ENV: "test", PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, ...env },
  });
}

describe("destructive recovery acceptance guards", () => {
  it("refuses fresh installation outside an isolated CI runner", () => {
    const result = guarded("test-vps-install", { CI: "false" });
    expect(result.status).toBe(64);
    expect(result.stderr).toContain("isolated CI runner");
  });

  it("refuses recovery outside CI before inspecting installation settings", () => {
    expect(guarded("test-vps-recovery", { CI: "false" }).status).toBe(64);
  });

  it.each(["0", "65536", "invalid"])("rejects fixture port %s before invoking host tools", (port) => {
    const result = guarded("test-vps-install", { CI: "true", SWM_TEST_HTTP_PORT: port });
    expect(result.status).toBe(64);
    expect(result.stderr).toContain("SWM_TEST_HTTP_PORT");
  });

  it("refuses non-fixture compose projects even when CI is set", () => {
    expect(guarded("test-vps-recovery", { CI: "true", SWM_COMPOSE_PROJECT: "swmach", SWM_UPDATE_INSTALL_DIR: "/production" }).status).toBe(64);
  });

  it("requires the disposable marker and rejects custom configuration paths", () => {
    const root = mkdtempSync(join(tmpdir(), "swm-recovery-guard-"));
    const env = { CI: "true", SWM_COMPOSE_PROJECT: "swmach-recovery-fixture", SWM_UPDATE_INSTALL_DIR: root };
    try {
      expect(guarded("test-vps-recovery", env).status).toBe(64);
      writeFileSync(join(root, ".spaceworks-recovery-test"), "disposable-acceptance-only\n");
      const result = guarded("test-vps-recovery", { ...env, SWM_STATIC_ENV_FILE: "/production.env" });
      expect(result.status).toBe(64);
      expect(result.stderr).toContain("disposable installation defaults");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
