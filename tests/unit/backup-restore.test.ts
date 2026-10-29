import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const source = readFileSync(path.join(root, "deploy/backup.sh"), "utf8").replaceAll("\r\n", "\n");
const begin = source.indexOf("  restore)\n");
const block = source.slice(begin, source.indexOf("\n  storage)", begin))
  .replace('file="/backups/', 'file="$BACKUP_FIXTURE_DIR/');
const windowsBash = "C:/Program Files/Git/bin/bash.exe";
const shell = process.platform === "win32" && existsSync(windowsBash) ? windowsBash : "sh";

function restore(truncate = false) {
  const directory = mkdtempSync(path.join(tmpdir(), "swm-restore-"));
  try {
    const compressed = gzipSync("CREATE TABLE public.recovered (id integer);\nINSERT INTO public.recovered VALUES (42);\n");
    writeFileSync(path.join(directory, "fixture.sql.gz"), truncate ? compressed.subarray(0, compressed.length - 8) : compressed);
    const result = spawnSync(shell, ["-c", `set -eu
umask 077
psql() {
  printf '%s' "$*" > "$BACKUP_FIXTURE_DIR/arguments"
  cat > "$BACKUP_FIXTURE_DIR/applied.sql"
}
case "$1" in
${block}
esac`, "--", "restore", "fixture.sql.gz"], { cwd: root, env: { ...process.env, BACKUP_FIXTURE_DIR: directory.replaceAll("\\", "/") }, encoding: "utf8", timeout: 30000 });
    return { ...result, applied: existsSync(path.join(directory, "applied.sql")) ? readFileSync(path.join(directory, "applied.sql"), "utf8") : null,
      arguments: existsSync(path.join(directory, "arguments")) ? readFileSync(path.join(directory, "arguments"), "utf8") : null };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe("bundled database restore", () => {
  it("applies a completely decoded archive through one error-stopping transaction", () => {
    const result = restore();
    expect(result.status, result.stderr).toBe(0);
    expect(result.applied).toContain("DROP SCHEMA IF EXISTS public CASCADE;");
    expect(result.applied).toContain("INSERT INTO public.recovered VALUES (42);");
    expect(result.applied).toContain("ALTER DEFAULT PRIVILEGES FOR ROLE swmach");
    expect(result.arguments).toContain("-X -v ON_ERROR_STOP=1 --single-transaction");
  });

  it("never calls psql when a gzip emits valid SQL but fails its missing checksum", () => {
    const result = restore(true);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/unexpected end/i);
    expect(result.applied).toBeNull();
    expect(result.arguments).toBeNull();
  });
});

const databaseFunction = source.slice(source.indexOf("database() {"), source.indexOf("\nmc_alias()"))
  .replaceAll("/backups/", "$BACKUP_FIXTURE_DIR/");

function backup(failure: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "swm-backup-"));
  try {
    const result = spawnSync(shell, ["-c", `set -eu
umask 077
pg_dump() {
  case "$BACKUP_FAILURE" in
    dump) printf 'partial SQL'; return 7 ;;
    empty) return 0 ;;
    *) printf 'CREATE TABLE public.recovered (id integer);\\n' ;;
  esac
}
gzip() { if [ "$BACKUP_FAILURE" = gzip ]; then printf partial; return 8; fi; command gzip "$@"; }
mv() { if [ "$BACKUP_FAILURE" = move ]; then return 9; fi; command mv "$@"; }
${databaseFunction}
if database scheduled; then exit 0; else exit "$?"; fi`, "--"], {
      cwd: root, env: { ...process.env, BACKUP_FIXTURE_DIR: directory.replaceAll("\\", "/"), BACKUP_FAILURE: failure },
      encoding: "utf8", timeout: 30000,
    });
    const files = readdirSync(directory);
    return { ...result, files, decoded: files.length === 1 ? gunzipSync(readFileSync(path.join(directory, files[0]))).toString() : null };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe("scheduled database backup failure handling", () => {
  it.each(["dump", "empty", "gzip", "move"])("does not publish a backup or claim success after %s fails in conditional context", (failure) => {
    const result = backup(failure);
    expect(result.status).not.toBe(0);
    expect(result.files).toEqual([]);
    expect(result.stdout).not.toContain("Database backup:");
  });

  it("publishes a complete gzip and removes its private SQL only after all commands succeed", () => {
    const result = backup("none");
    expect(result.status, result.stderr).toBe(0);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatch(/^scheduled-.*\.sql\.gz$/);
    expect(result.decoded).toContain("CREATE TABLE public.recovered");
    expect(result.stdout).toContain("Database backup:");
  });

  it("keeps previous backups by skipping retention when a scheduled dump fails", () => {
    const schedule = source.slice(source.indexOf("  schedule)\n"), source.indexOf("\n  restore)"));
    const result = spawnSync(shell, ["-c", `set -eu
database() { return 7; }
find() { printf 'RETENTION RAN'; }
sleep() { exit 0; }
case schedule in
${schedule}
esac`, "--"], { cwd: root, env: { ...process.env, retention_days: "14", interval_hours: "24" }, encoding: "utf8", timeout: 30000 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("RETENTION RAN");
    expect(result.stderr).toContain("keeping existing backups");
  });
});
