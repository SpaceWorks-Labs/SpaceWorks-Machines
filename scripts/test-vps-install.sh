#!/usr/bin/env bash
# CI-only fresh current-source installer and encrypted recovery acceptance.
# Public archive acquisition, public DNS/ACME and systemd remain separate VPS gates.
set -euo pipefail
set +x
umask 077
[[ ${CI:-} == true ]] || { echo 'Installer acceptance requires an isolated CI runner.' >&2; exit 64; }
test_http_port="${SWM_TEST_HTTP_PORT:-18081}"
[[ "$test_http_port" =~ ^[1-9][0-9]{0,4}$ ]] && ((test_http_port <= 65535)) \
  || { echo 'SWM_TEST_HTTP_PORT must be an integer from 1 to 65535.' >&2; exit 64; }
command -v age >/dev/null
command -v age-keygen >/dev/null
command -v openssl >/dev/null
docker buildx version >/dev/null
docker compose version >/dev/null
as_root() { if [[ $(id -u) == 0 ]]; then "$@"; else sudo "$@"; fi; }
source_root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
[[ "$work/" != "$source_root/"* ]] || { echo 'Temporary directory must be outside the source tree.' >&2; exit 64; }
ROOT="$work/install"
mkdir -m 700 "$ROOT"
tar -C "$source_root" --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='dist' \
  --exclude='.env*' --exclude='tls' --exclude='backups' --exclude='.spaceworks-*' --exclude='test-results' \
  -cf - . | tar -xf - -C "$ROOT"
find "$ROOT" -type f -name '*.sh' -exec chmod +x {} +
export SWM_UPDATE_INSTALL_DIR="$ROOT" SWM_COMPOSE_PROJECT
SWM_COMPOSE_PROJECT="swmach-recovery-$(date +%s)-$$"
export SWM_IMAGE_TAG="${SWM_IMAGE_TAG:-acceptance}"
export SWM_BACKEND_IMAGE="${SWM_BACKEND_IMAGE:-local/spaceworks-machines-backend}"
export SWM_FRONTEND_IMAGE="${SWM_FRONTEND_IMAGE:-local/spaceworks-machines-frontend}"
unset SWM_STATIC_ENV_FILE SWM_TLS_DIR SWM_BACKUP_DIR
COMPOSE=("$ROOT/scripts/spaceworks-compose.sh" bundled)
cleanup() {
  local status=$?
  if [[ "$status" != 0 && -f "$ROOT/.env" ]]; then
    "${COMPOSE[@]}" ps -a || true
    "${COMPOSE[@]}" logs --no-color --tail 60 backend db redis minio || true
  fi
  [[ ! -f "$ROOT/.env" ]] || "${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  as_root rm -rf -- "$work"
  exit "$status"
}
trap cleanup EXIT
cd "$ROOT"
printf 'disposable-acceptance-only\n' > .spaceworks-recovery-test
# Use exactly the confirmed installer's configuration writer, changing only its
# published fixture port to loopback so the CI runner cannot expose this site.
# shellcheck source=scripts/setup-question-input.sh
source scripts/setup-question-input.sh
# shellcheck source=scripts/spaceworks-repository.sh
source scripts/spaceworks-repository.sh
# shellcheck source=scripts/setup-write-environment.sh
source scripts/setup-write-environment.sh
die() { printf '%s\n' "$*" >&2; exit 1; }
export ANSWERS_CONFIRMED=yes RUN_FRONTEND=1 SITE_ORIGIN='' HTTPS_MODE=1 WEBHOST=localhost TLS_EMAIL='' STORAGE=1
export SUPER_ADMIN_EMAIL=admin@example.test EMAIL_FROM='Space Works Machines <audit@example.test>'
export SUPER_ADMIN_PASSWORD INSTALL_RUNNER=N
SUPER_ADMIN_PASSWORD="$(rand_key 40)"
export SMTP_HOST=mailpit SMTP_PORT=1025 SMTP_USER=acceptance SMTP_PASSWORD
SMTP_PASSWORD="$(rand_key 40)"
write_setup_environment
sed -i "s/^HTTP_PORT=.*/HTTP_PORT='$test_http_port'/" .env
sed -i "s|^PUBLIC_APP_BASE_URL=.*|PUBLIC_APP_BASE_URL='http://localhost:$test_http_port'|" .env
printf "HTTP_PORT_BIND='127.0.0.1'\n" >> .env
# The CI-only temporary installation owns this new probe. Never chmod a user's
# existing assets: refuse a collision and remove the entire fixture in cleanup.
asset_probe="$ROOT/public/__swmach_ci_asset_probe__"
[[ ! -e "$asset_probe" ]] || { echo 'Public asset fixture already exists.' >&2; exit 64; }
mkdir -m 700 -- "$asset_probe"
printf 'spaceworks-runtime-asset-probe\n' > "$asset_probe/asset.txt"
chmod 600 "$asset_probe/asset.txt"
# The temporary CI source copy must also work when the installer owns its
# bootstrap inputs privately; PostgreSQL drops to a different UID during init.
chmod 600 "$ROOT/deploy/pg_hba.conf"
chmod 700 "$ROOT/deploy/init-database.sh"
# Operator tools and their shared crypto helper must also survive owner-only source modes.
chmod 700 "$ROOT/docker/ops"
find "$ROOT/docker/ops" -type f -name '*.mjs' -exec chmod 600 {} +
chmod 600 "$ROOT/lib/mfaCrypto.mjs"
bash setup.sh --build
unset SWM_COMPOSE_BUILD_LAYER
[[ "$(stat -c %a .env)" == 600 ]]
"${COMPOSE[@]}" exec -T backend node -e '
const fs = require("node:fs"), assert = require("node:assert/strict");
const directory = "/app/public/__swmach_ci_asset_probe__", file = directory + "/asset.txt";
assert.notEqual(process.getuid(), 0);
assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
assert.equal(fs.statSync(file).mode & 0o777, 0o600);
assert.equal(fs.statSync(directory).uid, process.getuid());
assert.equal(fs.statSync(file).uid, process.getuid());
assert.equal(fs.readFileSync(file, "utf8"), "spaceworks-runtime-asset-probe\n");
for (const source of ["/app/docker/ops/check.mjs", "/app/lib/mfaCrypto.mjs"]) {
  assert.equal(fs.statSync(source).mode & 0o777, 0o600);
  assert.equal(fs.statSync(source).uid, process.getuid());
  assert.ok(fs.readFileSync(source, "utf8").length);
}
// A later dependency COPY may merge directory metadata; the runtime must traverse it.
fs.accessSync("/app/docker/ops", fs.constants.R_OK | fs.constants.X_OK);
console.log("Non-root public asset and operator source probes passed.");'
"${COMPOSE[@]}" exec -T --user postgres db sh -ec '
test -r /var/lib/postgresql/bootstrap/pg_hba.conf
test -x /docker-entrypoint-initdb.d/10-app-role.sh
test "$(stat -c %a /var/lib/postgresql/tls/server.key)" = 600
test "$(stat -c %a /var/lib/postgresql/bootstrap/pg_hba.conf)" = 600
test "$(stat -c %a /docker-entrypoint-initdb.d/10-app-role.sh)" = 700
printf "Non-root PostgreSQL bootstrap probe passed.\n"'
"${COMPOSE[@]}" exec -T backend node --input-type=module -e '
import assert from "node:assert/strict";
for (const method of ["GET", "POST"]) {
  const response = await fetch("http://127.0.0.1:3000/api/v1/maintenance/logs", {
    method, ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: "{}" } : {}),
  });
  assert.equal(response.status, 401, `Packaged maintenance ${method} must require an API key, not return 404`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).error, "Use a valid API key.");
}
console.log("Packaged maintenance GET/POST API authentication probe passed.");'
# shellcheck source=scripts/test-vps-mailpit.sh
source scripts/test-vps-mailpit.sh
test_worker_email
export SWM_BUILD_KEY
SWM_BUILD_KEY="$(aes_key)"
docker build --target frontend --secret id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,env=SWM_BUILD_KEY \
  --build-arg NEXT_PUBLIC_BASE_URL=https://spaceworks-machines-origin.invalid \
  --build-arg NEXT_PUBLIC_BACKEND_ORIGIN=https://spaceworks-machines-backend.invalid \
  --tag "$SWM_FRONTEND_IMAGE:$SWM_IMAGE_TAG" .
unset SWM_BUILD_KEY
# Exercise the real Docker context rules after setup has generated private TLS.
docker build --no-cache --tag local/machines-context-probe --file - . <<'DOCKERFILE'
FROM node:22-alpine
COPY . /context
RUN test ! -e /context/tls && test ! -e /context/.spaceworks-recovery-test && test ! -e /context/.env
DOCKERFILE
bash scripts/test-vps-recovery.sh
printf 'Fresh current-source installer, both Docker images and encrypted recovery acceptance passed.\n'
