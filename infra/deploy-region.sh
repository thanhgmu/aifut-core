#!/usr/bin/env bash
# deploy-region.sh — Deploy AIFUT to a specific geographic region
# Usage:
#   bash infra/deploy-region.sh vn           # Deploy to Vietnam
#   bash infra/deploy-region.sh sg .env.sg   # Singapore with custom env
#   bash infra/deploy-region.sh --list       # List available regions

set -euo pipefail

cd "$(dirname "$0")/.."

REGION_DIR="infra/regions"

# ── Help / list ─────────────────────────────────────
if [ $# -eq 0 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: bash infra/deploy-region.sh <region> [env-file]"
  echo ""
  echo "Available regions:"
  for d in "$REGION_DIR"/*/; do
    name=$(basename "$d")
    [ "$name" = "README.md" ] && continue
    desc=""
    [ -f "$d/.env.region" ] && desc=" $(head -1 "$d/.env.region" | sed 's/# //')"
    echo "  $name$desc"
  done
  echo ""
  echo "Examples:"
  echo "  bash infra/deploy-region.sh vn"
  echo "  bash infra/deploy-region.sh sg"
  echo "  bash infra/deploy-region.sh jp /path/to/custom.env"
  exit 0
fi

REGION="$1"
REGION_ENV="${2:-$REGION_DIR/$REGION/.env.region}"

if [ ! -f "$REGION_ENV" ]; then
  echo "❌ Region env not found: $REGION_ENV"
  echo "   Run with --list to see available regions."
  exit 1
fi

echo "╔══════════════════════════════════════════╗"
echo "║  Deploying AIFUT — Region: $(echo $REGION | tr '[:lower:]' '[:upper:]')"
echo "╚══════════════════════════════════════════╝"

# ── Load region config ──────────────────────────────
set -a
source "$REGION_ENV"
set +a

echo "→ Domain:     ${DOMAIN:-not set}"
echo "→ API Domain: ${API_DOMAIN:-not set}"
echo "→ Locale:     ${DEFAULT_LOCALE:-en}"
echo "→ Currency:   ${DEFAULT_CURRENCY:-USD}"
echo "→ Timezone:   ${TZ:-UTC}"

# ── Check prerequisites ─────────────────────────────
for cmd in docker docker-compose; do
  if ! command -v $cmd &>/dev/null; then
    echo "❌ $cmd not found. Install Docker first."
    exit 1
  fi
done

# ── Build region-specific docker-compose ────────────
COMPOSE_FILE="docker-compose.yml"
COMPOSE_OVERRIDE="infra/regions/$REGION/docker-compose.override.yml"

# Generate override file for region-specific settings
cat > "$COMPOSE_OVERRIDE" << COMPOSE_EOF
version: "3.9"

services:
  api:
    environment:
      - DEFAULT_LOCALE=${DEFAULT_LOCALE:-en}
      - DEFAULT_CURRENCY=${DEFAULT_CURRENCY:-VND}
      - TZ=${TZ:-Asia/Ho_Chi_Minh}
      - AI_REGION=${AI_REGION:-default}
    labels:
      - "aifut.region=${REGION}"
      - "aifut.domain=${API_DOMAIN}"

  web:
    environment:
      - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-https://api.aifut.app}
      - NEXT_PUBLIC_DEFAULT_LOCALE=${DEFAULT_LOCALE:-en}
      - TZ=${TZ:-Asia/Ho_Chi_Minh}
    labels:
      - "aifut.region=${REGION}"
      - "aifut.domain=${DOMAIN}"

  nginx:
    environment:
      - NGINX_HOST=${DOMAIN:-aifut.app}
      - NGINX_API_HOST=${API_DOMAIN:-api.aifut.app}
    labels:
      - "aifut.region=${REGION}"
COMPOSE_EOF

echo "→ Generated override: $COMPOSE_OVERRIDE"

# ── Deploy ──────────────────────────────────────────
echo "→ Deploying with: docker compose -f $COMPOSE_FILE -f $COMPOSE_OVERRIDE up -d"
docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" up -d --build --remove-orphans

echo ""
echo "✅ AIFUT deployed to region: $REGION"
echo "   Web:  https://${DOMAIN:-localhost:3000}"
echo "   API:  https://${API_DOMAIN:-localhost:3002}"
echo "   Time: $TZ"
echo ""
