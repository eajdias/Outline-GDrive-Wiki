#!/bin/sh
# Open the local Outline already authenticated, without magic link.
# Generates a one-time transfer token with the server's own code (signed with
# the user's jwtSecret), prints an /auth/redirect URL, and Outline trades the
# token for a 3-month session cookie.
#
# Local/dev use only. Not a production bypass: requires access to the Outline
# container and database. The token is never printed and temp files are removed.
#
# Usage: ./open-outline-session.sh [email]   (default: first admin user)
# Then open the printed URL in your browser.
set -eu

EMAIL="${1:-}"
INFRA_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
COMPOSE_FILE="$INFRA_DIR/../docker-compose.yml"

container="$(docker compose -f "$COMPOSE_FILE" ps -q outline | tr -d '[:space:]')"
[ -n "$container" ] || { echo "outline service is not running. Start the stack first (docker compose -f src/infra/docker-compose.yml up -d)." >&2; exit 1; }

tmp_dir="${TMPDIR:-/tmp}"
stamp="kb-outline-$$"
tmp_js="$tmp_dir/$stamp.cjs"
tmp_url="$tmp_dir/$stamp.url.txt"

# NOTE: never use /tmp inside the outline container: the compose mounts a
# tmpfs over /tmp, and files copied there are invisible to `docker exec`.
# Use the persistent data volume instead (cleaned up on exit).
WORK_DIR="/var/lib/outline/data"

cat > "$tmp_js" <<EOF
const fs = require("node:fs");
const jwt = require("/opt/outline/node_modules/jsonwebtoken");
require("/opt/outline/build/server/storage/database.js");
const { User } = require("/opt/outline/build/server/models/index.js");

(async () => {
  const where = process.env.OUTLINE_LOGIN_EMAIL
    ? { email: process.env.OUTLINE_LOGIN_EMAIL }
    : { role: "admin" };
  const user = await User.findOne({ where, order: [["createdAt", "ASC"]] });
  if (!user) throw new Error("user not found");

  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const token = jwt.sign(
    { id: user.id, type: "transfer", createdAt, expiresAt },
    user.jwtSecret,
  );

  const base = (process.env.URL || "http://localhost:3000").replace(/\/+$/, "");
  fs.writeFileSync(
    "$WORK_DIR/outline-login-url.txt",
    \`\${base}/auth/redirect?token=\${encodeURIComponent(token)}\`,
    { mode: 0o600 },
  );
  console.log(user.email);
  process.exit(0);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
EOF

cleanup() {
  rm -f "$tmp_js" "$tmp_url"
  docker exec -u 0 "$container" sh -c "rm -f $WORK_DIR/mint-outline.cjs $WORK_DIR/outline-login-url.txt" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

docker cp "$tmp_js" "$container:$WORK_DIR/mint-outline.cjs" >/dev/null

if [ -n "$EMAIL" ]; then
  user_email="$(docker exec -e "OUTLINE_LOGIN_EMAIL=$EMAIL" "$container" node --no-warnings $WORK_DIR/mint-outline.cjs)"
else
  user_email="$(docker exec "$container" node --no-warnings $WORK_DIR/mint-outline.cjs)"
fi

docker cp "$container:$WORK_DIR/outline-login-url.txt" "$tmp_url" >/dev/null
url="$(tr -d '\r\n[:space:]' < "$tmp_url" | tr -d ' ')"
origin="${url%%\?*}"

echo "Open $origin as $user_email (3-month session cookie)."
echo "$url"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$url" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open "$url" >/dev/null 2>&1 &
fi
