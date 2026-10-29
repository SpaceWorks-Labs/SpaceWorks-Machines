import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const source = readFileSync(path.join(root, "scripts/test-vps-recovery.sh"), "utf8").replaceAll("\r\n", "\n");
const start = source.indexOf('"${COMPOSE[@]}" up -d --wait --wait-timeout 300');
const commands = source.slice(start, source.indexOf("bash scripts/restore.sh", start));
const windowsBash = "C:/Program Files/Git/bin/bash.exe";
const bash = process.platform === "win32" && existsSync(windowsBash) ? windowsBash : "bash";

it("waits only on persistent recovery services and runs one-shot jobs explicitly without schedulers", () => {
  const result = spawnSync(bash, ["-c", `set -euo pipefail
COMPOSE=(compose)
compose() {
  if [[ "$*" == *--wait* ]]; then
    case "$*" in *createbuckets*|*migrate*) printf 'one-shot container exited (0)' >&2; return 7 ;; esac
  fi
  case "$*" in *backup*|*backend*|*worker*|*beat*|*caddy*) return 8 ;; esac
  printf '%s\\n' "$*"
}
${commands}`, "--"], { cwd: root, encoding: "utf8", timeout: 30000 });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim().split("\n").slice(0, 3)).toEqual([
    "up -d --wait --wait-timeout 300 db redis minio",
    "run --rm --no-deps -T createbuckets",
    "run --rm --no-deps -T migrate",
  ]);
});
