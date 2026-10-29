#!/usr/bin/env bash
# CI-only encrypted recovery proof; called by test-vps-install.sh on its own fixture.
set -euo pipefail
set +x
umask 077
[[ ${CI:-} == true ]] || { echo 'Recovery acceptance requires an isolated CI runner.' >&2; exit 64; }
: "${SWM_UPDATE_INSTALL_DIR:?Disposable installation required}"
: "${SWM_COMPOSE_PROJECT:?Disposable project required}"
[[ "$SWM_COMPOSE_PROJECT" =~ ^swmach-recovery-[a-z0-9-]+$ ]] || exit 64
ROOT="$SWM_UPDATE_INSTALL_DIR"
[[ -f "$ROOT/.spaceworks-recovery-test" && "$(cat "$ROOT/.spaceworks-recovery-test")" == disposable-acceptance-only ]] || exit 64
[[ -z ${SWM_STATIC_ENV_FILE:-}${SWM_TLS_DIR:-}${SWM_BACKUP_DIR:-} ]] || { echo 'Use the disposable installation defaults.' >&2; exit 64; }
command -v age >/dev/null
command -v age-keygen >/dev/null
as_root() { if [[ $(id -u) == 0 ]]; then "$@"; else sudo "$@"; fi; }
original_project="$SWM_COMPOSE_PROJECT"
work="$(mktemp -d)"
COMPOSE=("$ROOT/scripts/spaceworks-compose.sh" bundled)
cleanup() {
  local status=$?
  "${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  as_root rm -rf -- "$work"
  exit "$status"
}
trap cleanup EXIT
cd "$ROOT"
"${COMPOSE[@]}" run --rm --no-deps -T -e SWM_RECOVERY_SMOKE=1 ops --role ops node docker/ops/recovery-smoke.mjs seed
bash scripts/backup.sh
dump="$(find backups -maxdepth 1 -name 'manual-*.sql.gz' | sort | tail -n 1)"
config="$(find backups -maxdepth 1 -name 'config-*.tar.gz' | sort | tail -n 1)"
[[ -n "$dump" && -s "$dump" && -n "$config" && -s "$config" && -d backups/storage ]]
# The supported host backup command delegates off-server encryption to operators.
# Exercise that documented boundary with authenticated age encryption here.
age-keygen -o "$work/identity" 2>/dev/null
recipient="$(age-keygen -y "$work/identity")"
mkdir -m 700 "$work/off-host" "$work/archive" "$work/recovered"
as_root tar -cf - backups | age --recipient "$recipient" -o "$work/backup.tar.age"
cp "$work/backup.tar.age" "$work/off-host/backup.tar.age"
cmp "$work/backup.tar.age" "$work/off-host/backup.tar.age"
"${COMPOSE[@]}" down --volumes --remove-orphans
# Copy only release sources; configuration and keys must come from the archive.
tar --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='dist' \
  --exclude='.env*' --exclude='tls' --exclude='backups' --exclude='.spaceworks-*' --exclude='test-results' \
  -cf - . | tar -xf - -C "$work/recovered"
age --decrypt --identity "$work/identity" "$work/off-host/backup.tar.age" | as_root tar -xf - -C "$work/archive"
as_root cp -a "$work/archive/backups" "$work/recovered/backups"
as_root tar -xzf "$work/recovered/$config" -C "$work/recovered" .env tls
as_root cmp "$ROOT/.env" "$work/recovered/.env"
as_root diff -qr "$ROOT/tls" "$work/recovered/tls"
[[ "$(as_root stat -c %a "$work/recovered/.env")" == 600 ]]
export SWM_UPDATE_INSTALL_DIR="$work/recovered" SWM_COMPOSE_PROJECT="${original_project}-restored"
ROOT="$work/recovered"
printf 'disposable-acceptance-only\n' > "$ROOT/.spaceworks-recovery-test"
COMPOSE=("$work/recovered/scripts/spaceworks-compose.sh" bundled)
cd "$work/recovered"
# Keep scheduled mirrors and serving processes stopped until recovery finishes;
# an empty live bucket must never be mirrored over the recovered source files.
"${COMPOSE[@]}" up -d --wait --wait-timeout 300 db redis minio
"${COMPOSE[@]}" run --rm --no-deps -T createbuckets
"${COMPOSE[@]}" run --rm --no-deps -T migrate
"${COMPOSE[@]}" run --rm --no-deps -T ops --role ops node --input-type=module -e 'import {PrismaClient} from "@prisma/client"; const db=new PrismaClient(); if(await db.space.count()) throw Error("Recovery database was not empty"); await db.$disconnect();'
bash scripts/restore.sh "$dump" --with-storage --yes
"${COMPOSE[@]}" run --rm --no-deps -T -e SWM_RECOVERY_SMOKE=1 ops --role ops node docker/ops/recovery-smoke.mjs verify
"${COMPOSE[@]}" run --rm --no-deps -T ops
for service in worker beat; do
  "${COMPOSE[@]}" exec -T "$service" node --input-type=module -e 'const r=await fetch("http://127.0.0.1:3460/health"); if(!r.ok) process.exit(1); console.log("queue process healthy");'
done
# shellcheck source=scripts/test-vps-mailpit.sh
source scripts/test-vps-mailpit.sh
test_worker_email
printf 'Encrypted off-host backup restored onto empty volumes with recovered configuration, private objects and usable application MFA keys.\n'
