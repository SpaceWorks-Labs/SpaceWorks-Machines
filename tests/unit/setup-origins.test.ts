import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const windowsBash = "C:/Program Files/Git/bin/bash.exe";
const bash = process.platform === "win32" && existsSync(windowsBash) ? windowsBash : "bash";

function settings(mode: string, site: string, https: string, host: string) {
  const root = mkdtempSync(join(tmpdir(), "swm-setup-origins-"));
  const target = join(root, "fixture.env");
  try {
    // Only the real writer is sourced. Repository lookup is replaced so no
    // ambient installation settings or private environment file can be read.
    const result = spawnSync(bash, ["-s"], {
      encoding: "utf8", timeout: 5_000,
      env: { NODE_ENV: "test", PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT,
        SWM_STATIC_ENV_FILE: target, RUN_FRONTEND: mode, SITE_ORIGIN: site, HTTPS_MODE: https, WEBHOST: host },
      input: `set -euo pipefail
source scripts/setup-write-environment.sh
ROOT="$PWD"
configure_release_repository() { SWM_REPOSITORY=fixture/machines; SWM_BACKEND_IMAGE=local/backend; SWM_FRONTEND_IMAGE=local/frontend; }
rand_key() { printf 'fixture'; }
aes_key() { printf 'fixture-aes'; }
hex_key() { printf '%064d' 0; }
die() { exit 1; }
ANSWERS_CONFIRMED=yes STORAGE=1 TLS_EMAIL=''
SUPER_ADMIN_EMAIL=admin@example.test EMAIL_FROM=fixture@example.test
SMTP_HOST=mailpit SMTP_PORT=1025 SMTP_USER=fixture SMTP_PASSWORD=fixture
write_setup_environment
`,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    return Object.fromEntries([...readFileSync(target, "utf8").matchAll(/^([A-Z0-9_]+)='(.*)'$/gm)].map((match) => [match[1], match[2]]));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

describe("confirmed installer public origins", () => {
  it("ignores a retained split-site origin when the website moves onto the server", () => {
    const config = settings("1", "https://previous-site.example.test", "2", "machines.example.test");
    expect(config.PUBLIC_APP_BASE_URL).toBe("https://machines.example.test");
    expect(config.SITE_ADDRESS).toBe("machines.example.test");
    expect(config.DEPLOYMENT_MODE).toBeUndefined();
    expect(config.FRONTEND_GATEWAY_SECRET).toBeUndefined();
  });

  it("retains distinct website and API hosts for the split deployment", () => {
    const config = settings("2", "https://site.example.test", "2", "api.example.test");
    expect(config.PUBLIC_APP_BASE_URL).toBe("https://site.example.test");
    expect(config.SITE_ADDRESS).toBe("api.example.test");
    expect(config.DEPLOYMENT_MODE).toBe("backend");
    expect(config.FRONTEND_GATEWAY_SECRET).toHaveLength(64);
  });

  it("uses the same local host for the explicitly allowed HTTP layout", () => {
    const config = settings("1", "https://previous-site.example.test", "1", "machines.localhost");
    expect(config.PUBLIC_APP_BASE_URL).toBe("http://machines.localhost");
    expect(config.SITE_ADDRESS).toBe("http://machines.localhost");
    expect(config.ALLOW_PLAIN_HTTP).toBe("1");
  });
});
