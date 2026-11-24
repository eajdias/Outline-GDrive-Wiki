#!/bin/sh
# Postgres backup (dump) + restore test in a scratch database.
# 1) pg_dump -Fc inside the container to /tmp, copy to src/backups/.
# 2) Restore the dump into a scratch DB (outline_restore_test), count live
#    documents and compare with the real DB. Mismatch = failure.
# Backup is local; no cloud upload.
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(dirname -- "$SCRIPT_DIR")"
OUT_DIR="${1:-backups}"

stamp="$(date '+%Y%m%d-%H%M')"
dest_dir="$(dirname -- "$PROJECT_DIR")/$OUT_DIR"
mkdir -p "$dest_dir"
dest="$dest_dir/outline-$stamp.dump"

compose() { docker compose -f "$PROJECT_DIR/docker-compose.yml" "$@"; }

echo "== dump =="
compose exec -T postgres pg_dump -U outline -Fc outline -f /tmp/outline-backup.dump >/dev/null
compose cp postgres:/tmp/outline-backup.dump "$dest" >/dev/null
echo "dump at $dest ($(wc -c < "$dest" | tr -d ' ') bytes)"

echo "== restore test =="
compose exec -T postgres psql -U outline -d postgres -c "DROP DATABASE IF EXISTS outline_restore_test;" >/dev/null
compose exec -T postgres psql -U outline -d postgres -c "CREATE DATABASE outline_restore_test;" >/dev/null
compose exec -T postgres pg_restore -U outline -d outline_restore_test --no-owner /tmp/outline-backup.dump >/dev/null

live="$(compose exec -T postgres psql -U outline -d outline -tA -c 'select count(*) from documents where "deletedAt" is null and "archivedAt" is null;' | tr -d '[:space:]')"
restored="$(compose exec -T postgres psql -U outline -d outline_restore_test -tA -c 'select count(*) from documents where "deletedAt" is null and "archivedAt" is null;' | tr -d '[:space:]')"
echo "live: real=$live restore=$restored"

compose exec -T postgres psql -U outline -d postgres -c "DROP DATABASE outline_restore_test;" >/dev/null
compose exec -T postgres rm /tmp/outline-backup.dump >/dev/null

[ "$live" = "$restored" ] || { echo "divergent restore: real=$live restore=$restored" >&2; exit 1; }
echo "restore OK ($restored live documents)"
