# AIFUT Production Deployment

## Architecture

```
User → DNS → Nginx (SSL) → Web (:3000) / API (:3002) → PostgreSQL (:5432)
```

All services run in Docker containers orchestrated by docker-compose.

## Prerequisites

- VPS with Docker & docker-compose installed (Ubuntu 22.04+)
- Domain: `aifut.app` + `api.aifut.app`
- SSL cert from Let's Encrypt / Certbot
- GitHub secrets configured for CI/CD

## One-time Setup

### 1. Clone on VPS

```bash
ssh root@<vps-ip>
apt update && apt install -y docker.io docker-compose
mkdir -p /opt/aifut && cd /opt/aifut
git clone https://github.com/thanhgmu/aifut-core.git .
```

### 2. Configure environment

```bash
cp deploy/.env.example .env
# Edit .env with real values:
#   - Generate PG_PASSWORD: openssl rand -base64 32
#   - Generate JWT_SECRET: openssl rand -base64 48
nano .env
```

### 3. SSL certificate

```bash
# Install certbot
apt install -y certbot

# Get certificates
certbot certonly --standalone -d aifut.app -d api.aifut.app

# Copy to nginx SSL directory
cp /etc/letsencrypt/live/aifut.app/fullchain.pem deploy/ssl/
cp /etc/letsencrypt/live/aifut.app/privkey.pem deploy/ssl/

# Set up auto-renew
crontab -e
# Add: 0 3 * * * certbot renew --quiet && docker exec aifut-nginx nginx -s reload
```

### 4. Prisma migration & seed

```bash
docker compose up -d postgres
docker compose run --rm api npx prisma migrate deploy --schema=prisma/schema.prisma
docker compose run --rm api npx prisma db seed
```

### 5. Start everything

```bash
docker compose up -d
```

## Updating

### Automatic (CI/CD)
Push to `main` → GitHub Actions builds + deploys automatically.

### Manual
```bash
cd /opt/aifut
git pull
docker compose up -d --build
docker image prune -f
```

## Health Check

```bash
# Check all containers
docker compose ps

# Check API
curl https://api.aifut.app/health

# Check Web
curl https://aifut.app

# Check DB
docker compose exec postgres pg_isready -U aifut

# View logs
docker compose logs -f api
docker compose logs -f web
```

## Rollback

```bash
# To previous docker images
docker compose up -d api:<previous-tag> web:<previous-tag>

# Or git revert
git revert HEAD
git push
```

## Production Checklist

- [ ] `.env` configured with secure passwords
- [ ] SSL certificates installed
- [ ] Prisma migrations applied
- [ ] Firewall: ports 22, 80, 443 open
- [ ] Fail2ban configured
- [ ] Docker auto-restart enabled: `docker update --restart unless-stopped $(docker ps -q)`
- [ ] Regular backups: `pg_dump` to external storage
- [ ] Monitoring: uptime checks on /health endpoint

## Local Development (no Docker)

```bash
# Terminal 1 - Database
docker compose up -d postgres

# Terminal 2 - API
cd apps/api && npm run start:dev

# Terminal 3 - Web
cd apps/web && npm run dev
```
