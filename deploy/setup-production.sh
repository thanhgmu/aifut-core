#!/bin/bash
# setup-production.sh — Full production setup script
# Run on fresh VPS as root.
# Usage: bash deploy/setup-production.sh

set -euo pipefail

echo "╔══════════════════════════════════════════╗"
echo "║        AIFUT Production Setup            ║"
echo "╚══════════════════════════════════════════╝"

# ── Prerequisites ──────────────────────────────────
echo "→ Installing Docker..."
apt update && apt install -y docker.io docker-compose

echo "→ Starting Docker..."
systemctl enable --now docker

# ── Clone repo ────────────────────────────────────
REPO_DIR="/opt/aifut"
if [ ! -d "$REPO_DIR" ]; then
  echo "→ Cloning repository..."
  git clone https://github.com/thanhgmu/aifut-core.git "$REPO_DIR"
fi

cd "$REPO_DIR"

# ── Environment ────────────────────────────────────
if [ ! -f ".env" ]; then
  echo "→ Creating .env from template..."
  cp deploy/.env.example .env
  echo ""
  echo "⚠  Edit .env with your secrets: nano .env"
  echo "   Generate passwords with:"
  echo "     openssl rand -base64 32"
  echo ""
  read -p "Press Enter after configuring .env..."
fi

# ── SSL (optional) ────────────────────────────────
read -p "Setup SSL now? (y/n): " SETUP_SSL
if [ "$SETUP_SSL" = "y" ]; then
  read -p "Domain (e.g. aifut.app): " DOMAIN
  read -p "API Domain (e.g. api.aifut.app): " API_DOMAIN
  read -p "Email for certbot: " EMAIL
  bash deploy/setup-ssl.sh "$DOMAIN" "$API_DOMAIN" "$EMAIL"
fi

# ── Start stack ────────────────────────────────────
echo "→ Starting PostgreSQL..."
docker compose up -d postgres

echo "→ Waiting for PostgreSQL..."
sleep 5

echo "→ Running Prisma migrations..."
docker compose run --rm api npx prisma migrate deploy --schema=prisma/schema.prisma

echo "→ Seeding database..."
docker compose run --rm api npx prisma db seed

echo "→ Starting all services..."
docker compose up -d

# ── Health check ──────────────────────────────────
echo "→ Waiting for services..."
sleep 10

echo ""
echo "→ Checking health..."
curl -sf https://aifut.app/ | head -c 200 || echo "(web may need a moment)"
curl -sf https://api.aifut.app/health || echo "(api may need a moment)"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  AIFUT Production is LIVE!              ║"
echo "║                                          ║"
echo "║  Web:  https://aifut.app                ║"
echo "║  API:  https://api.aifut.app            ║"
echo "║  DB:   localhost:5432                   ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Manage: cd $REPO_DIR && docker compose logs -f [api|web|nginx]"
