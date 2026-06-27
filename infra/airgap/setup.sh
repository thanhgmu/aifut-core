#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# setup.sh — AIFUT Air-Gapped / On-Premise Setup Script
# ═══════════════════════════════════════════════════════════════════════════
# Chạy trên máy KHÔNG có internet hoặc môi trường SME on-premise.
# Yêu cầu: Docker Engine 24+ (pre-loaded hoặc offline install)
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#
# Hoặc:
#   docker compose -f ../docker/docker-compose.airgap.yml up -d
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

AIRGAP_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(dirname "$AIRGAP_DIR")"
PROJECT_DIR="$(dirname "$INFRA_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  AIFUT Air-Gapped Setup v1.0${NC}"
echo -e "${CYAN}  On-Premise / Sovereign Deployment${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ── 1. Check Docker ─────────────────────────────────────────────────────
echo -e "${YELLOW}[1/5]${NC} Checking Docker..."
if ! command -v docker &> /dev/null; then
  echo -e "${RED}✗ Docker not found!${NC}"
  echo "  Install Docker Engine v24+: https://docs.docker.com/engine/install/"
  echo "  Or use offline package: docker-24.0.7.tgz (pre-loaded in airgap bundle)"
  exit 1
fi
echo -e "${GREEN}✓ Docker $(docker --version | cut -d' ' -f3 | tr -d ',')${NC}"

# ── 2. Check Docker Compose ─────────────────────────────────────────────
echo -e "${YELLOW}[2/5]${NC} Checking Docker Compose..."
if ! docker compose version &> /dev/null 2>&1; then
  echo -e "${RED}✗ Docker Compose not found!${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker Compose $(docker compose version --short)${NC}"

# ── 3. Create data directories ─────────────────────────────────────────
echo -e "${YELLOW}[3/5]${NC} Creating data directories..."
mkdir -p "${AIRGAP_DIR}/data"
mkdir -p "${AIRGAP_DIR}/config"
mkdir -p "${AIRGAP_DIR}/ssl"

# Generate self-signed cert if no SSL provided
if [ ! -f "${AIRGAP_DIR}/ssl/cert.pem" ] || [ ! -f "${AIRGAP_DIR}/ssl/key.pem" ]; then
  echo -e "${YELLOW}  Generating self-signed SSL certificate for LAN use...${NC}"
  openssl req -x509 -nodes -days 3650 \
    -newkey rsa:2048 \
    -keyout "${AIRGAP_DIR}/ssl/key.pem" \
    -out "${AIRGAP_DIR}/ssl/cert.pem" \
    -subj "/CN=AIFUT-AirGap/O=AIFUT/C=VN"
  echo -e "${GREEN}✓ Self-signed cert created (valid 10 years)${NC}"
else
  echo -e "${GREEN}✓ SSL certificates found${NC}"
fi
echo -e "${GREEN}✓ Data directories ready${NC}"

# ── 4. Generate default config ──────────────────────────────────────────
echo -e "${YELLOW}[4/5]${NC} Generating config..."
CONFIG_FILE="${AIRGAP_DIR}/config/aifut.env"
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" << 'EOF'
# AIFUT Air-Gapped Configuration
# Tự động sinh — có thể chỉnh sửa

RUNTIME_MODE=local-sqlite
DATABASE_URL=file:///data/aifut.db
NODE_ENV=production
AIRGAP_MODE=true
DISABLE_TELEMETRY=true
DISABLE_CRON_SYNC=true

# JWT Secret (tự sinh)
JWT_SECRET=

# Admin account mặc định
DEFAULT_ADMIN_EMAIL=admin@aifut.local
DEFAULT_ADMIN_PASSWORD=admin123

# Ngôn ngữ mặc định
DEFAULT_LOCALE=vi

# Currency
DEFAULT_CURRENCY=VND
EOF

  # Generate JWT secret
  JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "aifut-airgap-$(date +%s)-$(hostname)")
  sed -i "s/JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" "$CONFIG_FILE"
  echo -e "${GREEN}✓ Config file created with auto-generated JWT secret${NC}"
else
  echo -e "${GREEN}✓ Config file exists${NC}"
fi

# ── 5. Start services ────────────────────────────────────────────────────
echo -e "${YELLOW}[5/5]${NC} Starting AIFUT Air-Gapped services..."
cd "$PROJECT_DIR"

docker compose \
  -f "${INFRA_DIR}/docker/docker-compose.airgap.yml" \
  up -d

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  AIFUT Air-Gap running!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Web UI:  ${CYAN}http://localhost:3000${NC}"
echo -e "  API:     ${CYAN}http://localhost:3002${NC}"
echo ""
echo -e "  Data:    ${YELLOW}${AIRGAP_DIR}/data/${NC}"
echo -e "  Config:  ${YELLOW}${AIRGAP_DIR}/config/${NC}"
echo ""
echo -e "  To stop:  ${CYAN}docker compose -f infra/docker/docker-compose.airgap.yml down${NC}"
echo -e "  Logs:     ${CYAN}docker compose -f infra/docker/docker-compose.airgap.yml logs -f${NC}"
echo ""
echo -e "${YELLOW}  ⚠ Default admin: admin@aifut.local / admin123${NC}"
echo -e "${YELLOW}  ⚠ CHANGE PASSWORD immediately after first login!${NC}"
echo ""
