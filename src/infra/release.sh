#!/bin/sh
# Gera o release transportável: tarball com compose travado + imagens + deploy.
# Uso: ./release.sh <versao> [--arch linux/amd64] [--registry PREFIX/]
# Ex.: ./release.sh 1.2.3
# Saída: dist/outline-gdrive-wiki-<versao>-<arch-sanitizado>.tar.gz
# Requer: repo git limpo, docker + buildx, gh (para publicar com --publish).
set -eu

INFRA_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(dirname -- "$INFRA_DIR")"
DIST_DIR="$REPO_ROOT/dist"

VERSION="${1:-}"
ARCH="linux/amd64"
REGISTRY=""
PUBLISH=0

usage() { echo "usage: $0 <versao> [--arch linux/amd64] [--registry PREFIX/] [--publish]" >&2; exit 2; }
[ -n "$VERSION" ] || usage
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --arch) ARCH="${2:-}"; [ -n "$ARCH" ] || usage; shift 2 ;;
    --arch=*) ARCH="${1#--arch=}"; shift ;;
    --registry) REGISTRY="${2:-}"; [ -n "$REGISTRY" ] || usage; shift 2 ;;
    --registry=*) REGISTRY="${1#--registry=}"; shift ;;
    --publish) PUBLISH=1; shift ;;
    -h|--help) usage ;;
    *) echo "unknown flag: $1" >&2; usage ;;
  esac
done

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker não encontrado"
[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ] && die "repo com mudanças não commitadas — commite antes do release"
command -v git >/dev/null 2>&1 || die "git não encontrado"

ARCH_SAFE="$(printf '%s' "$ARCH" | tr '/:' '--')"
BUNDLE="outline-gdrive-wiki-$VERSION-$ARCH_SAFE"
WORK="$DIST_DIR/$BUNDLE"
RELEASE_TAG="$VERSION"
export RELEASE_TAG

log "phase 1/6 build das imagens locais ($ARCH)"
docker buildx build --platform "$ARCH" --load \
  -t "${REGISTRY}kb-chat:$VERSION" \
  -f "$REPO_ROOT/apps/chat/Dockerfile" "$REPO_ROOT" || die "build do chat falhou"
docker buildx build --platform "$ARCH" --load \
  -t "${REGISTRY}kb-importer:$VERSION" \
  -f "$REPO_ROOT/apps/importer/Dockerfile" "$REPO_ROOT" || die "build do importer falhou"

log "phase 2/6 freeze: resolve digests das imagens third-party"
mkdir -p "$WORK" "$WORK/images"
cp "$INFRA_DIR/docker-compose.yml" "$INFRA_DIR/docker-compose.prod.yml" "$INFRA_DIR/.env.example" "$WORK/"
cp -r "$INFRA_DIR/edge" "$INFRA_DIR/scripts" "$INFRA_DIR/systemd" "$WORK/"
mkdir -p "$WORK/certs" "$WORK/backups" "$WORK/secrets"
printf '# coloque fullchain.pem + privkey.pem aqui (produção com TLS)\n' > "$WORK/certs/README"
printf '# coloque o JSON da service account aqui e aponte DRIVE_SA_KEY_PATH (ver .env.example)\n' > "$WORK/secrets/README"

cd "$INFRA_DIR"
RESOLVED="$WORK/docker-compose.resolved.yml"
RELEASE_TAG="$VERSION" docker compose -f docker-compose.yml -f docker-compose.prod.yml config --resolve-image-digests > "$RESOLVED" \
  || die "compose config --resolve-image-digests falhou"
sed -i "s#\${REGISTRY:-}#${REGISTRY}#g" "$RESOLVED" 2>/dev/null || true
IMAGES="$(docker compose -f "$RESOLVED" config --images | sort -u)"
[ -n "$IMAGES" ] || die "nenhuma imagem no compose resolvido"
printf '%s\n' "$IMAGES" > "$WORK/images.txt"

log "phase 3/6 pull + save (pode demorar na primeira vez)"
# shellcheck disable=SC2086
docker pull --platform "$ARCH" $IMAGES || die "pull das imagens falhou"
# shellcheck disable=SC2086
docker save --platform "$ARCH" $IMAGES | gzip > "$WORK/images/all.tar.gz" || die "docker save falhou"

log "phase 4/6 bundle: MANIFEST + deploy + docs"
GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
cat > "$WORK/MANIFEST.json" <<EOF
{
  "name": "outline-gdrive-wiki",
  "version": "$VERSION",
  "arch": "$ARCH",
  "git": "$GIT_SHA",
  "built_at": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "compose": ["docker-compose.yml", "docker-compose.prod.yml", "docker-compose.resolved.yml"]
}
EOF
cp "$REPO_ROOT/README.md" "$REPO_ROOT/LICENSE" "$WORK/"
cp "$REPO_ROOT/docs/setup.md" "$REPO_ROOT/docs/runbook.md" "$WORK/docs-" 2>/dev/null || { mkdir -p "$WORK/docs"; cp "$REPO_ROOT/docs/setup.md" "$REPO_ROOT/docs/runbook.md" "$WORK/docs/"; }
cat > "$WORK/INSTALL.md" <<EOF
# Instalar release $VERSION

Pré-requisitos: Docker Engine 24+ + Compose v2, 5 GB livres, .env preenchido.

\`\`\`bash
tar -xzf outline-gdrive-wiki-$VERSION-$ARCH_SAFE.tar.gz
cd $BUNDLE
cp .env.example .env   # preencher segredos (ver docs/setup.md)
./deploy-bundle.sh      # valida, carrega imagens, sobe com health-gate
\`\`\`
EOF
sed 's#src/infra/##g; s#\./deploy\.sh#./deploy-bundle.sh#g' "$INFRA_DIR/deploy.sh" > "$WORK/deploy-bundle.sh"
chmod +x "$WORK/deploy-bundle.sh"
cd "$WORK" && sha256sum docker-compose.yml docker-compose.prod.yml docker-compose.resolved.yml .env.example deploy-bundle.sh images/all.tar.gz MANIFEST.json > SHA256SUMS

log "phase 5/6 tarball final"
cd "$DIST_DIR"
tar -czf "$BUNDLE.tar.gz" "$BUNDLE"
sha256sum "$BUNDLE.tar.gz" | tee "$BUNDLE.tar.gz.sha256"
du -h "$BUNDLE.tar.gz" "$WORK/images/all.tar.gz"

log "phase 6/6 publish (só com --publish)"
if [ "$PUBLISH" -eq 1 ]; then
  command -v gh >/dev/null 2>&1 || die "gh não instalado — instale GitHub CLI para publicar"
  gh release create "v$VERSION" --generate-notes "$BUNDLE.tar.gz" "$BUNDLE.tar.gz.sha256" || die "gh release falhou"
fi

log "release OK: dist/$BUNDLE.tar.gz"
