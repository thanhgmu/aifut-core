#!/bin/bash
# ════════════════════════════════════════════════════════════════
# AIFUT — Pre-load Docker Images for Air-Gapped Environments
# ════════════════════════════════════════════════════════════════
# Run on a machine WITH internet access to save images to a tarball.
# Transfer the tarball to the air-gapped server and run the restore step.
#
# Usage:
#   # 1. On internet-connected machine:
#   bash preload-images.sh --save --output ./aifut-images.tar.gz
#
#   # 2. Copy aifut-images.tar.gz to air-gapped server
#   #    (USB drive, SCP, etc.)
#
#   # 3. On air-gapped server:
#   bash preload-images.sh --load --input ./aifut-images.tar.gz
#
# Options:
#   --save         Save images to tarball (requires internet)
#   --load         Load images from tarball (air-gapped)
#   --output PATH  Output tarball path (default: ./aifut-images.tar.gz)
#   --input  PATH  Input tarball path (default: ./aifut-images.tar.gz)
#   --version TAG  Image tag (default: latest)
#   --dry-run      Print commands without executing
#   --help         This message
# ════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colors ──────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}ℹ${NC} $1"; }
ok()    { echo -e "${GREEN}✔${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "${RED}✘${NC} $1"; exit 1; }
run()   { echo -e "${YELLOW}[exec]${NC} $*"; "$@"; }

# ── Defaults ────────────────────────────────────────
ACTION=""
OUTPUT="./aifut-images.tar.gz"
INPUT="./aifut-images.tar.gz"
AIFUT_VERSION="latest"
DRY_RUN=false

# ── Parse args ─────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --save)     ACTION="save"     ; shift ;;
    --load)     ACTION="load"     ; shift ;;
    --output)   OUTPUT="$2"       ; shift 2 ;;
    --input)    INPUT="$2"        ; shift 2 ;;
    --version)  AIFUT_VERSION="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=true      ; shift ;;
    --help|-h)  head -20 "$0"     ; exit 0 ;;
    *)          echo "Unknown: $1" >&2; exit 1 ;;
  esac
done

# ── Validate ────────────────────────────────────────
if [ -z "$ACTION" ]; then
  fail "Specify --save or --load"
fi

# ── Images to transfer ──────────────────────────────
IMAGES=(
  "postgres:16-alpine"
  "nginx:alpine"
  "aifut-api:${AIFUT_VERSION}"
  "aifut-web:${AIFUT_VERSION}"
)

if [ "$ACTION" = "save" ]; then
  # ── SAVE (internet-connected) ──────────────────────
  info "Pulling base images from Docker Hub..."
  run docker pull postgres:16-alpine
  run docker pull nginx:alpine

  info "Building AIFUT images..."
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
  run docker compose -f "$SCRIPT_DIR/docker-compose.airgap.yml" build api web

  info "Saving images to ${OUTPUT}..."
  run docker save "${IMAGES[@]}" -o "$OUTPUT"
  
  # Compress
  if [[ "$OUTPUT" == *.gz ]]; then
    info "Compressing..."
    run gzip -f "$OUTPUT" 2>/dev/null || true
    # gzip renames to .gz, adjust if needed
    if [ ! -f "$OUTPUT" ] && [ -f "${OUTPUT}.gz" ]; then
      OUTPUT="${OUTPUT}.gz"
    fi
  fi

  # Size
  SIZE=$(du -h "$OUTPUT" 2>/dev/null | cut -f1 || echo "unknown")
  ok "Images saved to ${OUTPUT} (${SIZE})"
  warn "Transfer this file to the air-gapped server, then run:"
  warn "  bash preload-images.sh --load --input ${OUTPUT}"

elif [ "$ACTION" = "load" ]; then
  # ── LOAD (air-gapped) ────────────────────────────
  if [ ! -f "$INPUT" ]; then
    fail "Image tarball not found: ${INPUT}"
  fi

  info "Loading images from ${INPUT}..."
  run docker load -i "$INPUT"
  ok "Images loaded successfully"

  echo ""
  echo -e "${GREEN}Images available:${NC}"
  docker images --filter "reference=aifut-*" --filter "reference=postgres:16*" --filter "reference=nginx:*" --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}"
  echo ""
  ok "Ready! Run: bash install-airgap.sh --license YOUR-LICENSE-KEY"
fi
