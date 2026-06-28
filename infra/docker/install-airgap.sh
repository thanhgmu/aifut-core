#!/bin/bash
# ════════════════════════════════════════════════════════════════
# AIFUT On-Premise / Air-Gapped Installer
# ════════════════════════════════════════════════════════════════
# Zero internet required after initial image transfer.
#
# Prerequisites:
#   - Docker Engine 24+ installed (offline)
#   - Images loaded (see preload-images.sh)
#   - License key from AIFUT (if licensing enabled)
#
# Quick start (from media):
#   ./install-airgap.sh --license LIC-XXXX-XXXX
#
# Full options:
#   --license KEY       AIFUT license key (required for on-premise edition)
#   --version TAG       Docker image tag (default: latest)
#   --domain DOMAIN     Public domain for web (default: localhost)
#   --ssl               Enable SSL with nginx (default: no)
#   --cert PATH         SSL certificate path (default: auto-generated self-signed)
#   --key PATH          SSL private key path
#   --admin-email EMAIL Admin email for alerts
#   --dry-run           Print commands without executing
#   --help              This message
# ════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colors ──────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── Defaults ────────────────────────────────────────
AIFUT_VERSION="latest"
AIFUT_LICENSE_KEY=""
DOMAIN="localhost"
ENABLE_SSL=false
SSL_CERT=""
SSL_KEY=""
ADMIN_EMAIL="admin@aifut.local"
DRY_RUN=false

# ── Parse args ─────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --license)    AIFUT_LICENSE_KEY="$2"; shift 2 ;;
    --version)    AIFUT_VERSION="$2"; shift 2 ;;
    --domain)     DOMAIN="$2"; shift 2 ;;
    --ssl)        ENABLE_SSL=true; shift ;;
    --cert)       SSL_CERT="$2"; shift 2 ;;
    --key)        SSL_KEY="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=true; shift ;;
    --help|-h)    head -30 "$0"; exit 0 ;;
    *)            echo "Unknown: $1" >&2; exit 1 ;;
  esac
done

# ── Helpers ─────────────────────────────────────────
info()  { echo -e "${BLUE}ℹ${NC} $1"; }
ok()    { echo -e "${GREEN}✔${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "${RED}✘${NC} $1"; exit 1; }
run()   {
  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[dry-run]${NC} $*"
  else
    "$@"
  fi
}

# ── Detection ──────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.airgap.yml"

# ── Validate ────────────────────────────────────────
info "Checking prerequisites..."

command -v docker &>/dev/null || fail "Docker is not installed. Install Docker 24+ first."
docker info &>/dev/null || fail "Docker daemon is not running or you lack permissions."

if [ ! -f "$COMPOSE_FILE" ]; then
  fail "docker-compose.airgap.yml not found at $COMPOSE_FILE"
fi

# ── Accept license ─────────────────────────────────
if [ -z "$AIFUT_LICENSE_KEY" ]; then
  warn "No license key provided. Continuing with trial mode (14-day limit)."
  warn "To activate, set: export AIFUT_LICENSE_KEY=LIC-XXXX-XXXX"
  AIFUT_LICENSE_KEY="trial"
fi

# ── Generate secrets (if missing) ──────────────────
if [ ! -f "$REPO_DIR/.env" ]; then
  info "Creating .env configuration..."
  cat > "$REPO_DIR/.env" <<EOF
# ── Database ──────────────────────────────────────────
PG_USER=aifut
PG_PASSWORD=$(openssl rand -base64 32)
PG_DB=aifut
DATABASE_URL=postgresql://aifut:${PG_PASSWORD}@postgres:5432/aifut

# ── Auth ──────────────────────────────────────────────
JWT_SECRET=$(openssl rand -base64 48)
JWT_EXPIRES_IN=7d

# ── API ───────────────────────────────────────────────
API_PORT=3002

# ── On-Premise ────────────────────────────────────────
AIFUT_LICENSE_KEY=${AIFUT_LICENSE_KEY}
AIFUT_EDITION=on-premise

# ── Web ───────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://${DOMAIN}:3002
NEXT_PUBLIC_EDITION=on-premise
EOF
  ok ".env created with auto-generated secrets"
else
  info ".env already exists — reusing existing configuration"
fi

# ── SSL (optional) ──────────────────────────────────
if [ "$ENABLE_SSL" = true ]; then
  SSL_DIR="$SCRIPT_DIR/ssl"
  run mkdir -p "$SSL_DIR"
  
  if [ -n "$SSL_CERT" ] && [ -n "$SSL_KEY" ]; then
    run cp "$SSL_CERT" "$SSL_DIR/fullchain.pem"
    run cp "$SSL_KEY" "$SSL_DIR/privkey.pem"
    ok "SSL certificates installed from provided paths"
  else
    info "Generating self-signed certificate for ${DOMAIN}..."
    run openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "$SSL_DIR/privkey.pem" \
      -out "$SSL_DIR/fullchain.pem" \
      -subj "/C=VN/O=AIFUT/CN=${DOMAIN}" \
      -addext "subjectAltName=DNS:${DOMAIN}"
    ok "Self-signed certificate generated"
  fi
fi

# ── Database init script ───────────────────────────
info "Ensuring init-db.sql exists..."
if [ ! -f "$SCRIPT_DIR/init-db.sql" ]; then
  cat > "$SCRIPT_DIR/init-db.sql" <<'SQLEOF'
-- ── AIFUT On-Premise: Initial database setup ──
-- This runs on first PostgreSQL container start.

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create application schema (main schema is managed by Prisma migrations)
-- This ensures clean state before Prisma runs.

-- Index maintenance template (uncomment for scheduled use)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS ...
SQLEOF
  ok "init-db.sql created"
fi

# ── Pull/Build images ──────────────────────────────
info "Building Docker images (air-gap: uses local build, not pull)..."

if [ "$DRY_RUN" = false ]; then
  # Check if images exist locally
  API_IMAGE_EXISTS=$(docker images -q aifut-api:${AIFUT_VERSION} 2>/dev/null)
  WEB_IMAGE_EXISTS=$(docker images -q aifut-web:${AIFUT_VERSION} 2>/dev/null)

  if [ -z "$API_IMAGE_EXISTS" ] || [ -z "$WEB_IMAGE_EXISTS" ]; then
    warn "Images not found locally. Building from source..."
    run docker compose -f "$COMPOSE_FILE" build api web
  else
    ok "Images aifut-api:${AIFUT_VERSION} and aifut-web:${AIFUT_VERSION} found locally"
  fi
fi

# ── Start PostgreSQL ────────────────────────────────
info "Starting PostgreSQL..."
run docker compose -f "$COMPOSE_FILE" up -d postgres

info "Waiting for PostgreSQL to be healthy..."
if [ "$DRY_RUN" = false ]; then
  for i in $(seq 1 30); do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U aifut &>/dev/null; then
      ok "PostgreSQL is healthy"
      break
    fi
    if [ "$i" -eq 30 ]; then
      fail "PostgreSQL failed to start within 30 seconds. Check logs: docker compose -f $COMPOSE_FILE logs postgres"
    fi
    sleep 1
  done
fi

# ── Run Prisma migrations ──────────────────────────
info "Running database migrations..."
run docker compose -f "$COMPOSE_FILE" run --rm api npx prisma migrate deploy
ok "Migrations applied"

# ── Start API and Web ──────────────────────────────
info "Starting API and Web services..."
run docker compose -f "$COMPOSE_FILE" up -d api web

# ── Health check ────────────────────────────────────
info "Performing health check..."
if [ "$DRY_RUN" = false ]; then
  sleep 8
  
  # API health
  if curl -sf http://127.0.0.1:3002/health > /dev/null 2>&1; then
    ok "API is healthy"
  else
    warn "API health check failed. Check logs: docker compose -f $COMPOSE_FILE logs api"
  fi
  
  # Web health
  if curl -sf http://127.0.0.1:3000/ > /dev/null 2>&1; then
    ok "Web UI is serving"
  else
    warn "Web health check failed. Check logs: docker compose -f $COMPOSE_FILE logs web"
  fi
fi

# ── Summary ─────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   AIFUT On-Premise Installation          ║${NC}"
echo -e "${GREEN}║          COMPLETE ✓                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}Web UI:${NC}       http://${DOMAIN}:3000"
echo -e "  ${BLUE}API:${NC}          http://${DOMAIN}:3002"
echo -e "  ${BLUE}Database:${NC}     postgresql://localhost:5432"
echo -e "  ${BLUE}License:${NC}      ${AIFUT_LICENSE_KEY:0:16}..."
echo -e "  ${BLUE}Version:${NC}      ${AIFUT_VERSION}"
echo ""
echo -e "  ${YELLOW}Manage:${NC}"
echo -e "    cd $(dirname "$COMPOSE_FILE")"
echo -e "    docker compose -f docker-compose.airgap.yml logs -f api"
echo -e "    docker compose -f docker-compose.airgap.yml restart web"
echo -e "    docker compose -f docker-compose.airgap.yml down"
echo ""
echo -e "  ${YELLOW}Backup:${NC}"
echo -e "    # Database"
echo -e "    docker compose -f docker-compose.airgap.yml exec -T postgres pg_dump -U aifut aifut > backup-\$(date +%Y%m%d).sql"
echo -e "    # Uploads"
echo -e "    tar czf uploads-\$(date +%Y%m%d).tar.gz -C \$(docker volume inspect aifut_api_uploads --format '{{.Mountpoint}}') ."
echo ""
echo -e "  ${YELLOW}Update:${NC}"
echo -e "    # Transfer updated images via USB/S3, then:"
echo -e "    docker compose -f docker-compose.airgap.yml pull"
echo -e "    docker compose -f docker-compose.airgap.yml up -d"
echo ""
