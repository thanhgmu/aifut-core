#!/usr/bin/env bash
# rollback-region.sh — Auto-restore the previous AIFUT image for a region
# when the post-deploy health check fails.
#
# Usage:
#   bash infra/rollback-region.sh vn                 # health-check + rollback if needed
#   bash infra/rollback-region.sh sg --force         # force rollback to previous tag
#   bash infra/rollback-region.sh vn --check-only    # only run health check, never rollback
#
# Strategy:
#   1. Resolve region health endpoints from infra/regions/<region>/.env.region
#   2. Probe /health (API) and / (Web) with retries
#   3. On failure: re-tag the previous image as :latest and redeploy via compose
#
# Requires: docker, docker compose, curl

set -euo pipefail

cd "$(dirname "$0")/.."

REGION_DIR="infra/regions"
RETRIES="${HEALTH_RETRIES:-5}"
RETRY_DELAY="${HEALTH_RETRY_DELAY:-10}"
PREV_TAG="${PREV_TAG:-previous}"

# ── Args ────────────────────────────────────────────
if [ $# -eq 0 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: bash infra/rollback-region.sh <region> [--force|--check-only]"
  echo ""
  echo "Available regions:"
  for d in "$REGION_DIR"/*/; do
    name=$(basename "$d")
    [ -f "$d/.env.region" ] && echo "  $name"
  done
  exit 0
fi

REGION="$1"
MODE="${2:-auto}"
REGION_ENV="$REGION_DIR/$REGION/.env.region"

if [ ! -f "$REGION_ENV" ]; then
  echo "❌ Region env not found: $REGION_ENV"
  exit 1
fi

# ── Load region config ──────────────────────────────
set -a
# shellcheck disable=SC1090
source "$REGION_ENV"
set +a

API_URL="${API_HEALTH_URL:-https://${API_DOMAIN:-localhost:3002}/health}"
WEB_URL="${WEB_HEALTH_URL:-https://${DOMAIN:-localhost:3000}/}"

COMPOSE_FILE="infra/docker/docker-compose.yml"
[ -f "$COMPOSE_FILE" ] || COMPOSE_FILE="docker-compose.yml"
COMPOSE_OVERRIDE="$REGION_DIR/$REGION/docker-compose.override.yml"

compose() {
  if [ -f "$COMPOSE_OVERRIDE" ]; then
    docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

echo "╔══════════════════════════════════════════╗"
echo "║  AIFUT Rollback Guard — Region: $(echo "$REGION" | tr '[:lower:]' '[:upper:]')"
echo "╚══════════════════════════════════════════╝"
echo "→ API health: $API_URL"
echo "→ Web health: $WEB_URL"

# ── Health check with retries ───────────────────────
health_check() {
  local url="$1" label="$2" i code
  for ((i = 1; i <= RETRIES; i++)); do
    code=$(curl -k -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" || echo "000")
    if [ "$code" -ge 200 ] && [ "$code" -lt 500 ]; then
      echo "  ✅ $label healthy (HTTP $code) [try $i/$RETRIES]"
      return 0
    fi
    echo "  ⏳ $label unhealthy (HTTP $code) [try $i/$RETRIES] — retrying in ${RETRY_DELAY}s"
    sleep "$RETRY_DELAY"
  done
  echo "  ❌ $label FAILED health check after $RETRIES tries"
  return 1
}

HEALTHY=true
if [ "$MODE" != "--force" ]; then
  echo ""
  echo "→ Running health checks..."
  health_check "$API_URL" "API" || HEALTHY=false
  health_check "$WEB_URL" "Web" || HEALTHY=false
fi

if [ "$MODE" = "--check-only" ]; then
  $HEALTHY && { echo "✅ All healthy. Exit 0."; exit 0; } || { echo "❌ Unhealthy."; exit 1; }
fi

if [ "$HEALTHY" = true ] && [ "$MODE" != "--force" ]; then
  echo ""
  echo "✅ Region $REGION healthy — no rollback needed."
  exit 0
fi

# ── Rollback ────────────────────────────────────────
echo ""
echo "⚠️  Initiating rollback for region: $REGION"

REGISTRY="${DOCKER_USERNAME:-aifut}"
for svc in api web; do
  cur="$REGISTRY/aifut-$svc:latest"
  prev="$REGISTRY/aifut-$svc:$PREV_TAG"
  echo "→ $svc: pulling previous image $prev"
  if docker pull "$prev" 2>/dev/null; then
    docker tag "$prev" "$cur"
    echo "  ✅ Re-tagged $prev → $cur"
  else
    echo "  ⚠️  No '$prev' image found — keeping current $cur"
  fi
done

echo "→ Redeploying previous version..."
compose up -d --remove-orphans

echo "→ Re-verifying health after rollback..."
sleep "$RETRY_DELAY"
POST=true
health_check "$API_URL" "API (post-rollback)" || POST=false
health_check "$WEB_URL" "Web (post-rollback)" || POST=false

echo ""
if [ "$POST" = true ]; then
  echo "✅ Rollback successful — region $REGION restored to previous version."
  exit 0
else
  echo "🚨 Rollback completed but health still failing — manual intervention required."
  exit 2
fi
