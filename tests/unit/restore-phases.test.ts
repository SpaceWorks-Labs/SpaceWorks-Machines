import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const source = readFileSync(path.join(root, "scripts/restore.sh"), "utf8").replaceAll("\r\n", "\n");
const phases = source.slice(source.indexOf("stopped=0 database_committed=0\n"));
const windowsBash = "C:/Program Files/Git/bin/bash.exe";
const bash = process.platform === "win32" && existsSync(windowsBash) ? windowsBash : "bash";

function restore(failure: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "swm-restore-phases-"));
  try {
    const result = spawnSync(bash, ["-c", `set -euo pipefail
COMPOSE=(compose)
SERVING_SERVICES=(backend worker beat caddy)
BACKUP_SERVICES=(backup backup-storage)
SCRIPT_DIR=/fixture/scripts
name=fixture.sql.gz
with_storage=1
serving_services() { :; }
say() { printf '%s\\n' "$*"; }
warn() { printf '%s\\n' "$*" >&2; }
bash() { printf '%s\\n' "pre-restore backup" >> "$RESTORE_FIXTURE_DIR/commands"; [[ "$RESTORE_FAILURE" != snapshot ]]; }
compose() {
  printf '%s\\n' "$*" >> "$RESTORE_FIXTURE_DIR/commands"
  case "$*" in
    'run --rm --no-deps -T backup restore fixture.sql.gz') [[ "$RESTORE_FAILURE" != database ]] || return 7 ;;
    'run --rm --no-deps -T backup-storage restore-storage') [[ "$RESTORE_FAILURE" != storage ]] || return 8 ;;
    'run --rm --no-deps -T migrate') [[ "$RESTORE_FAILURE" != migration ]] || return 10 ;;
    'up -d --wait --wait-timeout 300 --no-deps backend worker beat caddy') [[ "$RESTORE_FAILURE" != readiness ]] || return 9 ;;
    'run --rm --no-deps -T ops') [[ "$RESTORE_FAILURE" != checks ]] || return 11 ;;
  esac
  return 0
}
${phases}`, "--"], {
      cwd: root, env: { ...process.env, RESTORE_FIXTURE_DIR: directory.replaceAll("\\", "/"), RESTORE_FAILURE: failure },
      encoding: "utf8", timeout: 30000,
    });
    const commands = readFileSync(path.join(directory, "commands"), "utf8").trim().split("\n");
    return { ...result, commands };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe("database restore failure phases", () => {
  it("reopens the original stack after the database transaction fails before commit", () => {
    const result = restore("database");
    expect(result.status).toBe(7);
    expect(result.commands.at(-1)).toBe("up -d --no-deps backend worker beat caddy");
    expect(result.commands).not.toContain("run --rm --no-deps -T backup-storage restore-storage");
    expect(result.stderr).toContain("before database commit");
  });

  it.each(["storage", "migration", "readiness", "checks"] as const)("keeps serving and scheduled backups stopped after committed data and failed %s", (failure) => {
    const result = restore(failure);
    expect(result.status).toBe({ storage: 8, migration: 10, readiness: 9, checks: 11 }[failure]);
    expect(result.commands.at(-1)).toBe("stop backend worker beat caddy backup backup-storage");
    expect(result.commands.filter((command) => command.startsWith("stop "))).toHaveLength(2);
    expect(result.commands).not.toContain("up -d --no-deps backup backup-storage");
    expect(result.stderr).toContain("Keeping the site offline");
    expect(result.stdout).not.toContain("Restore finished");
  });

  it("reports success only after storage and the complete stack are ready", () => {
    const result = restore("none");
    expect(result.status, result.stderr).toBe(0);
    expect(result.commands.at(-1)).toBe("up -d --no-deps backup backup-storage");
    expect(result.commands[0]).toBe("stop backend worker beat caddy backup backup-storage");
    expect(result.commands.indexOf("run --rm --no-deps -T backup-storage restore-storage"))
      .toBeLessThan(result.commands.indexOf("run --rm --no-deps -T migrate"));
    expect(result.commands.indexOf("run --rm --no-deps -T migrate"))
      .toBeLessThan(result.commands.indexOf("up -d --wait --wait-timeout 300 --no-deps backend worker beat caddy"));
    expect(result.commands.at(-2)).toBe("run --rm --no-deps -T ops");
    expect(result.commands.filter((command) => command.startsWith("stop "))).toHaveLength(1);
    expect(result.stdout).toContain("Restore finished");
  });
});
