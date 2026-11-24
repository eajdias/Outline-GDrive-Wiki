#!/bin/sh
# Outline auto-update: pre-update dump + pull + recreate + health wait.
# Usage: ./update-outline.sh [--skip-backup] [health-timeout-seconds]
# Requires: docker compose (project dir = this script's parent).
set -eu

SKIP_BACKUP=0
HEALTH_TIMEOUT=180
for arg in "$@"; do
  case "$arg" in
    --skip-backup) SKIP_BACKUP=1 ;;
    ''|*[!0-9]*) echo "usage: $0 [--skip-backup] [health-timeout-seconds]" >&2; exit 2 ;;
    *) HEALTH_TIMEOUT="$arg" ;;
  esac
done

INFRA_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
COMPOSE_FILE="$INFRA_DIR/docker-compose.yml"
LOG_FILE="$INFRA_DIR/update-outline.log"
BACKUP_DIR="$INFRA_DIR/backups"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"; }
compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

[ -f "$COMPOSE_FILE" ] || { echo "Compose file not found: $COMPOSE_FILE" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"

log "=== Outline auto-update start ==="
if ! outline_container="$(compose ps -q outline)"; then outline_container=""; fi
[ -n "$outline_container" ] || { log "ERROR: outline container is not running"; exit 1; }
log "Current container image: $(docker inspect --format '{{.Image}}' "$outline_container")"

if [ "$SKIP_BACKUP" -eq 0 ]; then
  stamp="$(date '+%Y%m%d-%H%M%S')"
  tmp_path="/tmp/pre-update-$stamp.dump"
  dest_path="$BACKUP_DIR/pre-update-$stamp.dump"
  log "Creating pre-update DB backup: $dest_path"
  compose exec -T postgres pg_dump -U outline -Fc outline -f "$tmp_path"
  [ -z "${POSTGRES_CONTAINER:-}" ] || true
  postgres_container="$(compose ps -q postgres)"
  docker cp "$postgres_container:$tmp_path" "$dest_path"
  compose exec -T postgres rm -f "$tmp_path"
  log "Backup created: $dest_path"
else
  log "Skipping pre-update backup (--skip-backup)"
fi

log "Pulling outlinewiki/outline:latest"
compose pull outline

log "Applying update (recreate outline if image changed)"
compose up -d --no-deps outline

log "Waiting for outline health (timeout ${HEALTH_TIMEOUT}s)..."
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
healthy=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  outline_container="$(compose ps -q outline 2>/dev/null || true)"
  if [ -n "$outline_container" ]; then
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$outline_container" 2>/dev/null || true)"
    if [ "$health" = "healthy" ]; then healthy=1; break; fi
    if [ "$health" = "running" ]; then
      has_health="$(docker inspect --format '{{if .State.Health}}yes{{else}}no{{end}}' "$outline_container" 2>/dev/null || true)"
      if [ "$has_health" = "no" ]; then healthy=1; break; fi
    fi
  fi
  sleep 5
done
if [ "$healthy" -ne 1 ]; then
  state="$(docker inspect --format '{{json .State}}' "$outline_container" 2>/dev/null || true)"
  log "ERROR: Outline did not become healthy within ${HEALTH_TIMEOUT}s. State: $state"
  log "=== Outline auto-update end (failed) ==="
  exit 1
fi

log "Container image after update: $(docker inspect --format '{{.Image}}' "$outline_container")"
log "outlinewiki/outline:latest => $(docker image inspect outlinewiki/outline:latest --format '{{.Id}} {{.Created}}' 2>/dev/null || echo unknown)"
log "Result: outline updated/recreated"
log "=== Outline auto-update end (success) ==="
