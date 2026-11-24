#!/bin/sh
# Backup one-shot: Postgres + globals + arquivos de estado.
# Roda via: docker compose -f src/infra/docker-compose.yml run --rm backup
# O timer do host agenda; este script valida e retém.
set -eu

STAMP="$(date +%Y%m%d-%H%M)"
DEST="/backups"
KEEP="${BACKUP_KEEP_DAILY:-7}"

echo "== postgres dump =="
pg_dump -h postgres -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" -f "/tmp/pg-$STAMP.dump"
cp "/tmp/pg-$STAMP.dump" "$DEST/pg-$STAMP.dump"
rm -f "/tmp/pg-$STAMP.dump"

echo "== globals =="
pg_dumpall -h postgres -U "$POSTGRES_USER" --globals-only | gzip > "$DEST/globals-$STAMP.sql.gz"

echo "== state files =="
tar -czf "$DEST/files-$STAMP.tgz" /redis/appendonly.aof /wiki-data /rag-data 2>/dev/null || \
  tar -czf "$DEST/files-$STAMP.tgz" /wiki-data /rag-data 2>/dev/null || true

echo "== validate =="
ls -la "$DEST/pg-$STAMP.dump" "$DEST/globals-$STAMP.sql.gz" "$DEST/files-$STAMP.tgz"
pg_restore --list "$DEST/pg-$STAMP.dump" > /dev/null
gunzip -t "$DEST/globals-$STAMP.sql.gz"
tar -tzf "$DEST/files-$STAMP.tgz" > /dev/null

echo "== retain last $KEEP daily sets =="
ls -1t "$DEST"/pg-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
ls -1t "$DEST"/globals-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
ls -1t "$DEST"/files-*.tgz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

echo "backup OK: $STAMP ($(du -h "$DEST/pg-$STAMP.dump" | cut -f1))"
