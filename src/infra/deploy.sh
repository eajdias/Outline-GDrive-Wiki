#!/bin/sh
# Deploy idempotente do Outline GDrive Wiki.
# Uso: ./deploy.sh [--env-file PATH] [--no-backup] [--yes] [--timeout SECS] [--pull|--no-pull]
# Re-rodar é seguro: valida, faz backup, sobe com health-gate, resume no fim.
set -eu

INFRA_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
COMPOSE_BASE="$INFRA_DIR/docker-compose.yml"
COMPOSE_PROD="$INFRA_DIR/docker-compose.prod.yml"
ENV_FILE="$INFRA_DIR/.env"
DO_BACKUP=1
ASSUME_YES=0
TIMEOUT=300
PULL_MODE="missing"

usage() { echo "usage: $0 [--env-file PATH] [--no-backup] [--yes] [--timeout SECS] [--pull|--no-pull]" >&2; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) ENV_FILE="${2:-}"; [ -n "$ENV_FILE" ] || usage; shift 2 ;;
    --env-file=*) ENV_FILE="${1#--env-file=}"; shift ;;
    --no-backup) DO_BACKUP=0; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --timeout) TIMEOUT="${2:-300}"; shift 2 ;;
    --timeout=*) TIMEOUT="${1#--timeout=}"; shift ;;
    --pull) PULL_MODE="always"; shift ;;
    --no-pull) PULL_MODE="never"; shift ;;
    -h|--help) usage ;;
    *) echo "unknown flag: $1" >&2; usage ;;
  esac
done

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_BASE" ${COMPOSE_OVERLAY:+-f "$COMPOSE_OVERLAY"} "$@"; }

# Modo bundle (release tarball): imagens vêm de images/*.tar.gz, sem build.
BUNDLE_MODE=0
if [ -d "$INFRA_DIR/images" ] && ls "$INFRA_DIR"/images/*.tar* >/dev/null 2>&1; then
  BUNDLE_MODE=1
fi

FILES="docker-compose.yml"
COMPOSE_OVERLAY=""
if [ -f "$COMPOSE_PROD" ] && [ "${DEPLOY_ENV:-dev}" = "prod" ]; then
  COMPOSE_OVERLAY="$COMPOSE_PROD"
  FILES="docker-compose.yml + docker-compose.prod.yml"
fi

log "phase 1/6 preflight (files: $FILES, env: $ENV_FILE)"
command -v docker >/dev/null 2>&1 || die "docker não encontrado"
docker compose version >/dev/null 2>&1 || die "docker compose v2 não encontrado"
[ -f "$COMPOSE_BASE" ] || die "compose base ausente: $COMPOSE_BASE"
[ -f "$ENV_FILE" ] || die "env ausente: $ENV_FILE (copie de .env.example)"
case "$(stat -c %a "$ENV_FILE" 2>/dev/null || stat -f %Lp "$ENV_FILE" 2>/dev/null)" in
  600|400) ;;
  *) log "aviso: permissões de $ENV_FILE não são 600 — corrija com chmod 600" ;;
esac

log "phase 2/6 env-validate (fail fast, sem expor valores)"
missing=""
for var in POSTGRES_PASSWORD SECRET_KEY UTILS_SECRET GEMINI_API_KEY ANYTHINGLLM_JWT_SECRET ANYTHINGLLM_AUTH_TOKEN ANYTHINGLLM_API_KEY OUTLINE_API_KEY DRIVE_SA_KEY_PATH DRIVE_ROOT_FOLDER_ID; do
  val="$(grep -E "^${var}=" "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]' || true)"
  [ -n "$val" ] || missing="$missing $var"
done
[ -z "$missing" ] || die "variáveis vazias no env:$missing"
sa_path="$(grep -E '^DRIVE_SA_KEY_PATH=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')"
[ -f "$sa_path" ] || die "DRIVE_SA_KEY_PATH não existe: $sa_path"
compose config -q || die "compose config inválido"

log "phase 3/6 backup (a menos que --no-backup)"
if [ "$DO_BACKUP" -eq 1 ]; then
  if [ "$ASSUME_YES" -eq 0 ]; then
    printf 'Rodar backup pré-deploy? [Y/n] '; read -r ans
    case "$ans" in [nN]*) DO_BACKUP=0 ;; esac
  fi
fi
if [ "$DO_BACKUP" -eq 1 ]; then
  compose --profile tools run --rm backup || die "backup falhou — deploy abortado"
else
  log "backup pulado (--no-backup)"
fi

log "phase 4/6 images (pull: $PULL_MODE, bundle: $BUNDLE_MODE)"
if [ "$BUNDLE_MODE" -eq 1 ]; then
  for img in "$INFRA_DIR"/images/*.tar*; do
    log "docker load -i $img"
    docker load -i "$img" || die "docker load falhou: $img"
  done
  PULL_MODE="never"
fi
if [ "$PULL_MODE" != "never" ]; then
  compose pull --policy "$PULL_MODE" 2>/dev/null || compose pull
fi
if [ "$BUNDLE_MODE" -eq 1 ]; then
  log "bundle: imagens locais carregadas, sem build"
else
  compose build chat importer
fi

log "phase 5/6 up + health-gate (timeout ${TIMEOUT}s)"
compose up -d --wait --wait-timeout "$TIMEOUT" || {
  compose ps
  compose logs --tail=100
  die "health-gate falhou — containers mantidos para diagnóstico (ver logs acima)"
}

log "phase 6/6 summary"
compose ps
edge_port="$(grep -E '^EDGE_PORT=' "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]' || true)"
edge_port="${edge_port:-8091}"
printf 'Wiki: http://127.0.0.1:%s  Chat: http://127.0.0.1:%s/chat/\n' "$edge_port" "$edge_port"
printf 'Health: docker compose --env-file %s -f %s ps\n' "$ENV_FILE" "$COMPOSE_BASE"
log "deploy OK"
