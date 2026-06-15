#!/bin/bash
# setup-ssl.sh — One-time SSL certificate setup for AIFUT
# Run as root on your VPS.
# Usage: bash deploy/setup-ssl.sh

set -euo pipefail

DOMAIN="${1:-}"
API_DOMAIN="${2:-}"
EMAIL="${3:-admin@aifut.app}"

if [ -z "$DOMAIN" ]; then
  echo "Usage: $0 <primary-domain> [api-domain] [email]"
  echo "Example: $0 aifut.app api.aifut.app admin@aifut.app"
  exit 1
fi

API_DOMAIN="${API_DOMAIN:-api.$DOMAIN}"

echo "=== Installing certbot ==="
apt update
apt install -y certbot

echo "=== Getting certificates for $DOMAIN and $API_DOMAIN ==="
certbot certonly --standalone \
  -d "$DOMAIN" \
  -d "$API_DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

echo "=== Creating SSL directory ==="
mkdir -p deploy/ssl

echo "=== Copying certificates ==="
cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" deploy/ssl/
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" deploy/ssl/
chmod 600 deploy/ssl/privkey.pem

echo "=== Testing Nginx config ==="
docker compose up -d nginx 2>/dev/null || true

echo "=== Setting up auto-renew ==="
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && docker exec aifut-nginx nginx -s reload") | crontab -

echo ""
echo "=== SSL Setup Complete ==="
echo "  Domain:     https://$DOMAIN"
echo "  API:        https://$API_DOMAIN"
echo "  Auto-renew: daily 3 AM"
echo ""
