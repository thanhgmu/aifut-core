# AIFUT On-Premise Deployment

## Overview

AIFUT supports **on-premise / air-gapped** deployment for enterprise customers who require:

- **Data sovereignty** — all data stays on customer infrastructure
- **Zero internet dependency** — no phoning home after initial image transfer
- **No cloud lock-in** — single-tenant dedicated instance
- **Full control** — database, network, backup, upgrade timing

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Customer VPS / VM                   │
│                                                      │
│  ┌──────────┐    ┌──────────┐    ┌────────────────┐ │
│  │  Nginx   │───▶│  Web UI  │    │   Prometheus   │ │
│  │ (:80/443)│    │ (:3000)  │    │   (:9090)      │ │
│  └──────────┘    └──────────┘    └────────────────┘ │
│       │           ┌──────────┐    ┌────────────────┐ │
│       └──────────▶│  API     │───▶│   Grafana      │ │
│                   │ (:3002)  │    │   (:3001)      │ │
│                   └──────────┘    └────────────────┘ │
│                        │                             │
│                   ┌────▼────┐                        │
│                   │PostgreSQL│                       │
│                   │ (:5432)  │                       │
│                   └─────────┘                        │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Build & Transfer Images

On an **internet-connected** machine:

```bash
# Clone the repo
git clone https://github.com/thanhgmu/aifut-core.git
cd aifut-core

# Save all images to a tarball (~800MB)
bash infra/docker/preload-images.sh --save --output ./aifut-images.tar.gz
```

Copy `aifut-images.tar.gz` to the target server via USB drive, SCP, or any transfer method.

### 2. Install on Target Server

On the **air-gapped** server:

```bash
# Prerequisites: Docker Engine 24+ installed offline
#   (install Docker packages from official offline bundle)

# Copy the repo + images tarball to the server, then:
cd /opt/aifut
tar xzf aifut-images.tar.gz  # or copy repo manually

# Load images into Docker
bash infra/docker/preload-images.sh --load --input ./aifut-images.tar.gz

# Install AIFUT
bash infra/docker/install-airgap.sh --license LIC-XXXX-XXXX
```

### 3. Access

```
Web UI:  http://<server-ip>:3000
API:     http://<server-ip>:3002
```

Default admin credentials are set during first run (check logs for auto-generated password).

## Production Configuration

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AIFUT_LICENSE_KEY` | ✅ | — | On-premise license key |
| `AIFUT_EDITION` | — | `on-premise` | Edition identifier |
| `JWT_SECRET` | ✅ | auto | 64+ char random string |
| `PG_PASSWORD` | ✅ | auto | Database password (auto-generated) |
| `DOMAIN` | — | `localhost` | Public domain name |

### SSL / HTTPS

#### Option A: Self-Signed (for internal/LAN use)

```bash
bash infra/docker/install-airgap.sh --ssl
```

#### Option B: Real Certificate

```bash
bash infra/docker/install-airgap.sh --ssl --cert /path/to/fullchain.pem --key /path/to/privkey.pem
```

## Backup & Restore

### Automated Backup

On-premise customers should set up a cron job:

```bash
# Daily database backup (retain 7 days)
0 2 * * * cd /opt/aifut && \
  docker compose -f infra/docker/docker-compose.airgap.yml exec -T postgres \
    pg_dump -U aifut aifut > /backups/aifut-$(date +\%Y\%m\%d).sql && \
  find /backups -name 'aifut-*.sql' -mtime +7 -delete

# Weekly full backup
0 3 * * 0 cd /opt/aifut && \
  tar czf /backups/aifut-full-$(date +\%Y\%m\%d).tar.gz \
    -C infra/docker/docker-compose.airgap.yml . && \
  find /backups -name 'aifut-full-*.tar.gz' -mtime +30 -delete
```

### Restore

```bash
# Stop services
docker compose -f infra/docker/docker-compose.airgap.yml down

# Restore database
docker compose -f infra/docker/docker-compose.airgap.yml up -d postgres
cat /backups/aifut-20250101.sql | \
  docker compose -f infra/docker/docker-compose.airgap.yml exec -T postgres \
    psql -U aifut -d aifut

# Start all services
docker compose -f infra/docker/docker-compose.airgap.yml up -d
```

## Updating

```bash
# Transfer newer images via preload-images.sh, then:
docker compose -f infra/docker/docker-compose.airgap.yml pull
docker compose -f infra/docker/docker-compose.airgap.yml up -d

# Run new migrations (if schema changed)
docker compose -f infra/docker/docker-compose.airgap.yml run --rm api npx prisma migrate deploy
```

## Monitoring (Optional)

```bash
# Start monitoring stack
docker compose \
  -f infra/docker/docker-compose.airgap.yml \
  -f infra/docker/docker-compose.monitoring.yml \
  up -d

# Grafana: http://<server-ip>:3001 (admin/admin)
# Prometheus: http://<server-ip>:9090
```

## System Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Disk | 20 GB | 50+ GB (SSD) |
| Docker | 24+ | latest |

## Support

Enterprise on-premise customers receive:
- Priority email/Slack support
- Quarterly security patches
- License-managed updates
- Backup/DR assistance

Contact: enterprise@aifut.app
