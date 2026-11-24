#!/bin/sh
# Gera o release transportável: tarball SÓ com fonte (build acontece no alvo).
# Uso: ./release.sh <versao>
# Ex.: ./release.sh 1.2.3
# Saída: dist/outline-gdrive-wiki-<versao>.tar.gz (KBs, sem imagens, sem segredos)
# Requer: repo git limpo.
set -eu

INFRA_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(dirname -- "$INFRA_DIR")"
DIST_DIR="$REPO_ROOT/dist"

VERSION="${1:-}"
usage() { echo "usage: $0 <versao>" >&2; exit 2; }
[ -n "$VERSION" ] || usage

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ] && die "repo com mudanças não commitadas — commite antes do release"

BUNDLE="outline-gdrive-wiki-$VERSION"
WORK="$DIST_DIR/$BUNDLE"
GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"

log "montando bundle $BUNDLE (fonte, sem node_modules/dist/.env/secrets)"
rm -rf "$WORK"
mkdir -p "$WORK"
cd "$REPO_ROOT"
git archive --format=tar HEAD apps packages src docs README.md LICENSE package.json package-lock.json | tar -x -C "$WORK"

cat > "$WORK/MANIFEST.json" <<EOF
{
  "name": "outline-gdrive-wiki",
  "version": "$VERSION",
  "git": "$GIT_SHA",
  "built_at": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "install": "tar -xzf $BUNDLE.tar.gz && cd $BUNDLE && cp src/infra/.env.example src/infra/.env && ./src/infra/deploy.sh"
}
EOF

log "tarball final"
mkdir -p "$DIST_DIR"
cd "$DIST_DIR"
tar -czf "$BUNDLE.tar.gz" "$BUNDLE"
sha256sum "$BUNDLE.tar.gz" | tee "$BUNDLE.tar.gz.sha256"
du -h "$BUNDLE.tar.gz"

log "release OK: dist/$BUNDLE.tar.gz (publicar com: gh release create v$VERSION $BUNDLE.tar.gz)"
