#!/bin/sh
# Backups for the bundled stack, written to backups/ on the host. One script, two images:
#   postgres:16-alpine (service backup):   schedule | database PREFIX | restore FILE
#   pgsty/silo (service backup-storage):   schedule-storage | storage | restore-storage
# The database runs over TLS as the owner role; storage is a mirror of the private
# bucket (the bucket itself is versioned). Run on demand through scripts/backup.sh
# and scripts/restore.sh; the two services run the schedules.
set -eu
umask 077
interval_hours=${BACKUP_INTERVAL_HOURS:-24}
retention_days=${BACKUP_RETENTION_DAYS:-14}
bucket=local/spaceworks-machines

database() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="/backups/$1-$stamp.sql.gz"
  # Write the dump first: a pipeline would hide a failed pg_dump behind gzip.
  pg_dump --no-password > "/backups/.$1-$stamp.sql"
  test -s "/backups/.$1-$stamp.sql"
  gzip -c "/backups/.$1-$stamp.sql" > "$target.partial"
  rm -f "/backups/.$1-$stamp.sql"
  mv "$target.partial" "$target"
  echo "Database backup: backups/$(basename "$target")"
}

mc_alias() {
  # Credentials through the environment, not the command line (see deploy/createbuckets.sh).
  MC_HOST_local="https://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000"
  export MC_HOST_local
  until mc ls local >/dev/null 2>&1; do sleep 2; done
}

case "${1:-}" in
  database) database "${2:-manual}" ;;
  schedule)
    while :; do
      database scheduled || echo 'Scheduled database backup failed; retrying next interval.' >&2
      find /backups -maxdepth 1 -name 'scheduled-*.sql.gz' -mtime +"$retention_days" -delete
      sleep $((interval_hours * 3600))
    done ;;
  restore)
    file="/backups/$(basename "${2:?usage: backup.sh restore FILE}")"
    test -s "$file"
    # Replace the schema in one transaction; grants for the runtime role come back
    # with the dump, and default privileges are restored for future migrations.
    { printf 'DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\nGRANT USAGE ON SCHEMA public TO swmach_app;\n'
      gunzip -c "$file"
      printf 'ALTER DEFAULT PRIVILEGES FOR ROLE swmach IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO swmach_app;\n'
      printf 'ALTER DEFAULT PRIVILEGES FOR ROLE swmach IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO swmach_app;\n'
      printf 'ALTER DEFAULT PRIVILEGES FOR ROLE swmach IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO swmach_app;\n'
    } | psql --no-password -v ON_ERROR_STOP=1 --single-transaction --quiet >/dev/null
    echo "Database restored from backups/$(basename "$file")." ;;
  storage)
    mc_alias
    mc mirror --overwrite --remove --quiet "$bucket" /backups/storage >/dev/null
    echo 'Storage backup: backups/storage (mirror of the private bucket)' ;;
  schedule-storage)
    mc_alias
    while :; do
      mc mirror --overwrite --remove --quiet "$bucket" /backups/storage >/dev/null \
        || echo 'Scheduled storage backup failed; retrying next interval.' >&2
      sleep $((interval_hours * 3600))
    done ;;
  restore-storage)
    mc_alias
    test -d /backups/storage
    mc mirror --overwrite --quiet /backups/storage "$bucket" >/dev/null
    echo 'Storage restored from backups/storage; newer files were kept.' ;;
  *) echo 'Usage: backup.sh schedule|database PREFIX|restore FILE|storage|schedule-storage|restore-storage' >&2; exit 64 ;;
esac
