#!/bin/sh
# Mint an Outline API key for the importer without using the browser.
# Creates a full-access key (scope "*") for the oldest admin user, writes it
# straight into the compose .env (OUTLINE_API_KEY) and removes temp files.
# The key value is never printed.
#
# Usage: ./mint-outline-apikey.sh [--env-file PATH]
# Requires: outline container running, admin user already signed up.
set -eu

INFRA_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
COMPOSE_FILE="$INFRA_DIR/../docker-compose.yml"
ENV_FILE="$INFRA_DIR/../.env"

while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) ENV_FILE="${2:-}"; [ -n "$ENV_FILE" ] || exit 2; shift 2 ;;
    --env-file=*) ENV_FILE="${1#--env-file=}"; shift ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

[ -f "$ENV_FILE" ] || { echo "env ausente: $ENV_FILE" >&2; exit 1; }

container="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q outline | tr -d '[:space:]')"
[ -n "$container" ] || { echo "outline service is not running" >&2; exit 1; }

tmp_dir="${TMPDIR:-/tmp}"
stamp="kb-apikey-$$"
tmp_js="$tmp_dir/$stamp.cjs"

cleanup() {
  rm -f "$tmp_js"
  docker exec -u 0 "$container" sh -c "rm -f /tmp/mint-apikey.cjs /tmp/outline-apikey.txt" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cat > "$tmp_js" <<'EOF'
const fs = require("node:fs");
require("/opt/outline/build/server/storage/database.js");
const { User, ApiKey } = require("/opt/outline/build/server/models/index.js");

(async () => {
  const user = await User.findOne({ where: { role: "admin" }, order: [["createdAt", "ASC"]] });
  if (!user) throw new Error("admin user not found - sign up in the wiki first");
  const apiKey = await ApiKey.create({ name: "importer", userId: user.id, scope: ["*"] });
  if (!apiKey.value) throw new Error("key value not returned");
  fs.writeFileSync("/tmp/outline-apikey.txt", apiKey.value, { mode: 0o600 });
  console.log("minted");
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
EOF

docker cp "$tmp_js" "$container:/tmp/mint-apikey.cjs" >/dev/null
docker exec "$container" node --no-warnings /tmp/mint-apikey.cjs
docker cp "$container:/tmp/outline-apikey.txt" "$tmp_dir/$stamp.key" >/dev/null
chmod 600 "$tmp_dir/$stamp.key"

grep -v -E '^OUTLINE_API_KEY=' "$ENV_FILE" > "$ENV_FILE.tmp"
key="$(cat "$tmp_dir/$stamp.key")"
printf '%s=%s\n' "OUTLINE_API_KEY" "$key" >> "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"
rm -f "$tmp_dir/$stamp.key"

echo "OUTLINE_API_KEY gravada no env (valor nunca exibido). Recrie o importer."
