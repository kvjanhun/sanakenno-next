#!/bin/bash

PROJECT_DIR="${PROJECT_DIR:-$HOME/Projects/sanakenno}"
WEB_ROOT="/var/www/sanakenno"

cd "$PROJECT_DIR" || exit 1

if [ -f "$HOME/.config/site-alerts.env" ]; then
  # shellcheck source=/dev/null
  source "$HOME/.config/site-alerts.env"
fi

send_telegram() {
  if [ -z "${TELEGRAM_BOT_TOKEN}" ] || [ -z "${TELEGRAM_CHAT_ID}" ]; then
    return 0
  fi
  # --data-urlencode: a plain -d would let & or = inside the message split the
  # form body, making Telegram silently reject the message (unclosed HTML tag).
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$1" \
    -d "parse_mode=HTML" > /dev/null 2>&1
}

# Escape dynamic content (commit subjects) interpolated into parse_mode=HTML
# messages, so a subject containing & or < cannot break the whole alert.
html_escape() {
  sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g' <<< "$1"
}

fail() {
  send_telegram "❌ <b>Sanakenno deploy failed</b>
Stage: <code>$1</code>
Commit: <code>$(git log -1 --pretty=%h 2>/dev/null || echo unknown)</code> $(html_escape "$(git log -1 --pretty=%s 2>/dev/null)")
Time: $(date "+%Y-%m-%d %H:%M")"
  exit 1
}

# Health checks that go through nginx can blip while upstreams re-establish
# during the container swap, so every check gets a few attempts before the
# deploy is declared failed.
check_health() {
  local url="$1" attempts="${2:-5}" i
  for i in $(seq 1 "$attempts"); do
    curl -fsS --max-time 10 "$url" > /dev/null 2>&1 && return 0
    [ "$i" -lt "$attempts" ] && sleep 3
  done
  return 1
}

if [ "$1" != "--post-pull" ]; then
  if [ -f "$HOME/.ssh/sanakenno_deploy_key" ]; then
    export GIT_SSH_COMMAND="ssh -i $HOME/.ssh/sanakenno_deploy_key -o IdentitiesOnly=yes"
  fi
  echo "Pulling latest changes from GitHub..."
  git stash
  git pull origin main || fail "git pull"
  git stash drop 2>/dev/null || true
  # Re-exec the freshly-pulled script so script-level changes (new flags,
  # new stages, retry logic) take effect on the same deploy that introduces
  # them, instead of one cycle late.
  exec "$0" --post-pull
  fail "exec self"
fi

# Serialise deploys: overlapping webhook fires would otherwise race the git
# state and the docker build. Waits up to 5 minutes for an in-flight deploy.
if command -v flock > /dev/null 2>&1; then
  exec 9> /tmp/deploy-sanakenno.lock
  flock -w 300 9 || fail "deploy lock"
fi

# Baked into the image as dist/commit.txt so this script — and CI — can verify
# that what is live matches what was pushed.
GIT_COMMIT=$(git rev-parse HEAD)
export GIT_COMMIT

echo "Rebuilding Docker containers (sanakenno-a & sanakenno-b)..."
docker rm -f sanakenno 2>/dev/null || true
docker compose up --build -d --remove-orphans --wait --wait-timeout 90 || fail "docker compose"

echo "Running post-deploy health checks on dual containers..."
check_health "http://127.0.0.1:8081/api/health" || fail "health 8081"
check_health "http://127.0.0.1:8082/api/health" || fail "health 8082"

echo "Extracting frontend build to $WEB_ROOT/dist..."
rm -rf "$WEB_ROOT/dist.new"
docker cp sanakenno-a:/app/dist "$WEB_ROOT/dist.new" || fail "docker cp dist"
rm -rf "$WEB_ROOT/dist.prev"
[ -d "$WEB_ROOT/dist" ] && mv "$WEB_ROOT/dist" "$WEB_ROOT/dist.prev"
mv "$WEB_ROOT/dist.new" "$WEB_ROOT/dist" || fail "swap dist"

echo "Verifying live site..."
check_health "https://sanakenno.fi/api/health" || fail "site health"
LIVE_COMMIT=$(curl -fsS --max-time 10 "https://sanakenno.fi/commit.txt" 2>/dev/null)
if [ "$LIVE_COMMIT" != "$GIT_COMMIT" ]; then
  echo "Commit verify failed: expected $GIT_COMMIT, live ${LIVE_COMMIT:-<empty>}"
  fail "commit verify"
fi

COMMIT_MSG=$(html_escape "$(git log -1 --pretty=%s)")
COMMIT_HASH=$(git log -1 --pretty=%h)
send_telegram "🟢 <b>Sanakenno deployed &amp; verified</b>
<code>${COMMIT_HASH}</code> ${COMMIT_MSG}
Site: https://sanakenno.fi"

echo "Deploy complete."
