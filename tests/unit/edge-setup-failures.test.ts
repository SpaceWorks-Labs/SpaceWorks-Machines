import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const windowsBash = "C:/Program Files/Git/bin/bash.exe";
const bash = process.platform === "win32" && existsSync(windowsBash) ? windowsBash : "bash";

function phase(name: "setup" | "update" | "smoke") {
  const file = name === "setup" ? "setup.sh" : `scripts/${name === "smoke" ? "compose-smoke" : "update"}.sh`;
  const source = readFileSync(file, "utf8").replaceAll("\r\n", "\n");
  const first = name === "setup" ? 'if [[ "$BUILD_FROM_SOURCE" == 1 ]]; then\n  say "Building the backend'
    : name === "update" ? '"${COMPOSE[@]}" pull --quiet --ignore-buildable'
      : 'if [[ "${SWM_COMPOSE_BUILD_LAYER:-0}" == 1 ]]; then';
  const last = name === "setup" ? "# 2. Private CA" : name === "update" ? "deployment_started=1" : "MSYS_NO_PATHCONV=1 docker run";
  const start = source.indexOf(first);
  const end = source.indexOf(last, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("edge preparation does not hide earlier installation failures", () => {
  it.each([
    ["setup", "1", "build backend"],
    ["setup", "0", "pull --quiet --ignore-buildable"],
    ["setup", "0", "build caddy"],
    ["update", "0", "pull --quiet --ignore-buildable"],
    ["smoke", "1", "build backend"],
  ] as const)("stops %s mode %s when %s fails under a conditional caller", (name, mode, failure) => {
    const result = spawnSync(bash, ["-s"], {
      encoding: "utf8", timeout: 15_000,
      env: { NODE_ENV: "test", PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT },
      input: `set -euo pipefail
BUILD_FROM_SOURCE=${mode} SWM_COMPOSE_BUILD_LAYER=${mode}
compose() { printf '%s\\n' "$*"; [[ "$*" != '${failure}' ]]; }
COMPOSE=(compose)
say() { :; }
die() { printf '%s\\n' "$*" >&2; exit 31; }
build_web_edge() { compose build caddy; }
prepare_images() {
${phase(name)}
}
# Bash disables errexit inside functions invoked as conditions. The real image
# preparation statements must explicitly stop rather than reach a later success.
if prepare_images; then printf 'unexpected-success\\n'; else exit 32; fi
`,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(31);
    expect(result.stdout).not.toContain("unexpected-success");
    if (failure !== "build caddy") expect(result.stdout).not.toContain("build caddy");
  });
});
