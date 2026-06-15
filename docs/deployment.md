# AIFUT Deployment
> Complete deployment guide for single-region and multi-country setups

---

## Quick Start (Single VPS)

```bash
# 1. Clone & configure
git clone https://github.com/thanhgmu/aifut-core.git /opt/aifut
cd /opt/aifut
cp deploy/.env.example .env
nano .env  # Add secrets

# 2. Start PostgreSQL
docker compose up -d postgres

# 3. Run migrations
docker compose run --rm api npx prisma migrate deploy --schema=prisma/schema.prisma

# 4. Seed demo data (optional)
docker compose run --rm api npx ts-node apps/api/scripts/seed-demo.ts

# 5. Start everything
docker compose up -d
```

## Multi-Country Deployment

AIFUT supports deploying independent instances per region for:
- Data residency compliance (Vietnam's Cybersecurity Law, Singapore's PDPA, Japan's APPI)
- Lower latency for local users
- Regional payment gateways (VNPay/MoMo in VN, Stripe in SG/US)
- Localized defaults (currency, locale, timezone)

### Deploy to a Region

```bash
# Deploy to Vietnam
bash infra/deploy-region.sh vn

# Deploy to Singapore
bash infra/deploy-region.sh sg

# Deploy to Thailand
bash infra/deploy-region.sh th

# Deploy to Japan
bash infra/deploy-region.sh jp

# Deploy to US
bash infra/deploy-region.sh us
```

### Region Configuration

Each region has its own environment template at `infra/regions/<region>/.env.region`:

| Region | Code | Domain | Currency | Locale | Payment Gateways |
|---|---|---|---|---|---|
| Vietnam | vn | aifut.vn | VND | vi | VNPay, MoMo |
| Singapore | sg | aifut.sg | SGD | en | Stripe |
| Thailand | th | aifut.co.th | THB | th | Stripe |
| Japan | jp | aifut.jp | JPY | ja | Stripe (PayPay/Konbini planned) |
| United States | us | aifut.us | USD | en | Stripe |

## Architecture

```
User → DNS → Cloudflare/CDN → Nginx (SSL) → Web (:3000) / API (:3002) → PostgreSQL (:5432)
```

All services run in Docker containers orchestrated by docker-compose.

## Production Checklist

- [ ] `.env` configured with secure passwords
- [ ] SSL certificates installed
- [ ] Prisma migrations applied
- [ ] Firewall: ports 22, 80, 443 open
- [ ] Fail2ban configured
- [ ] Docker auto-restart enabled
- [ ] Regular backups (`pg_dump` to external storage)
- [ ] Monitoring: uptime checks on /health endpoint
- [ ] Region-specific payment gateways configured

## CI/CD

See `.github/workflows/deploy.yml` for automatic deployment on push to `main`.
