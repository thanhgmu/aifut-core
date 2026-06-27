# AIFUT Air-Gapped Deployment

> Triển khai AIFUT trên môi trường không có internet hoặc on-premise.
> **0 external dependencies** — SQLite local, không cần PostgreSQL, không cần cloud.

---

## 🎯 Khi nào dùng Air-Gap?

| Scenario | Mô tả |
|---|---|
| 🏢 **SME Việt Nam** | Không muốn thuê VPS, chạy luôn trên máy tính để bàn |
| 🏛️ **Government** | Yêu cầu dữ liệu không rời khỏi máy, air-gapped network |
| 🏭 **Factory/Manufacturing** | Mạng nội bộ, không internet |
| 💼 **Consultant** | Demo offline cho khách hàng, không cần setup cloud |
| 🔒 **Security audit** | Kiểm tra security trong môi trường cô lập |
| 🚢 **Ship/Offshore** | Kết nối internet không ổn định |

## 🚀 Quick Start

### Yêu cầu
- Docker Engine 24+ (có thể offline install)
- Docker Compose v2+
- 2GB RAM, 5GB disk

### 1. Clone hoặc copy source

```bash
# Có internet:
git clone https://github.com/thanhgmu/aifut-core.git /opt/aifut
cd /opt/aifut

# Không internet: copy từ USB/DVD vào /opt/aifut
```

### 2. Chạy setup script

```bash
chmod +x infra/airgap/setup.sh
sudo ./infra/airgap/setup.sh
```

Script sẽ tự động:
- Kiểm tra Docker
- Tạo data directory
- Sinh SSL self-signed certificate
- Tạo config file với JWT secret
- Start containers

### 3. Truy cập

```
Web UI:  http://localhost:3000
API:     http://localhost:3002
Login:   admin@aifut.local / admin123
```

> ⚠️ **Đổi mật khẩu ngay sau lần đăng nhập đầu tiên!**

## 🏗️ Kiến trúc

```
┌─────────────────────────────────────────────┐
│  Docker Container: aifut-airgap-core         │
│                                              │
│  ┌─────────┐   ┌──────────┐                 │
│  │ Web UI  │   │ API      │                 │
│  │ :3000   │──▶│ :3002    │                 │
│  └─────────┘   └────┬─────┘                 │
│                     │                        │
│              ┌──────▼──────┐                │
│              │  SQLite DB  │  /data/aifut.db│
│              │ (local file)│                │
│              └─────────────┘                │
│                                              │
│  Volumes:                                    │
│    aifut_data   → /data  (DB + uploads)      │
│    aifut_config → /config (config override)  │
└─────────────────────────────────────────────┘
```

### Không cần:
- ❌ PostgreSQL (dùng SQLite)
- ❌ Redis (không cần cache layer cho single-user)
- ❌ Internet access
- ❌ Cloudflare / external DNS
- ❌ SSL từ CA (self-signed cho LAN)

## ⚙️ Configuration

### Environment variables (in `config/aifut.env`)

| Variable | Default | Description |
|---|---|---|
| `RUNTIME_MODE` | `local-sqlite` | Chế độ local SQLite |
| `DATABASE_URL` | `file:///data/aifut.db` | SQLite file path |
| `AIRGAP_MODE` | `true` | Tắt mọi external call |
| `DISABLE_TELEMETRY` | `true` | Không gửi telemetry |
| `DISABLE_CRON_SYNC` | `true` | Không sync cron jobs |
| `JWT_SECRET` | auto-generated | Secret cho JWT tokens |
| `DEFAULT_LOCALE` | `vi` | Ngôn ngữ mặc định |

### Override config

Chỉnh sửa file và restart:

```bash
nano infra/airgap/config/aifut.env
docker compose -f infra/docker/docker-compose.airgap.yml restart
```

## 📦 Offline Image Bundle

Nếu không có internet để pull images:

```bash
# Trên máy có internet — tạo bundle
tar czf aifut-airgap-images.tar \
  infra/docker/docker-compose.airgap.yml \
  infra/docker/nginx.airgap.conf \
  infra/airgap/

# Copy qua USB → máy offline
# Trên máy offline:
docker load < aifut-airgap-images.tar
./infra/airgap/setup.sh
```

## 🛠️ Management Commands

### Stop
```bash
docker compose -f infra/docker/docker-compose.airgap.yml down
```

### Restart
```bash
docker compose -f infra/docker/docker-compose.airgap.yml restart
```

### View logs
```bash
docker compose -f infra/docker/docker-compose.airgap.yml logs -f
```

### Backup SQLite database
```bash
# Backup
cp infra/airgap/data/aifut.db infra/airgap/data/aifut.db.bak.$(date +%Y%m%d)

# Restore
cp infra/airgap/data/aifut.db.bak.20260101 infra/airgap/data/aifut.db
docker compose -f infra/docker/docker-compose.airgap.yml restart
```

### Reset everything
```bash
docker compose -f infra/docker/docker-compose.airgap.yml down -v
rm -rf infra/airgap/data/*
rm -rf infra/airgap/config/*
# Then re-run: ./infra/airgap/setup.sh
```

## 🔐 Security Notes

1. **Default credentials:** `admin@aifut.local / admin123` — CHANGE IMMEDIATELY
2. **Self-signed SSL:** Browser sẽ cảnh báo — đó là bình thường cho LAN
3. **SQLite encryption:** Thêm SQLCipher để encrypt database ở rest
4. **Firewall:** Chỉ mở port 3000 (hoặc 80/443 với nginx) cho LAN
5. **Backup:** Copy `data/aifut.db` định kỳ ra external storage

## 📋 Production Checklist

- [ ] Đổi mật khẩu admin mặc định
- [ ] Tạo JWT secret mạnh (script đã tự sinh)
- [ ] Cấu hình SSL certificate chính thức (nếu cần HTTPS public)
- [ ] Backup SQLite database định kỳ (crontab)
- [ ] Kiểm tra Docker auto-restart: `docker update --restart unless-stopped aifut-airgap-core`
- [ ] Firewall rules kiểm tra

## 🔄 Upgrade

```bash
cd /opt/aifut
git pull   # hoặc copy new source from USB
docker compose -f infra/docker/docker-compose.airgap.yml up -d --build
```

> Upgrade không mất dữ liệu — SQLite DB nằm trong volume `aifut_data`.

---

## 📎 Related

- `infra/docker/docker-compose.airgap.yml` — Docker Compose config
- `infra/docker/nginx.airgap.conf` — Nginx config for LAN
- `infra/airgap/setup.sh` — Setup script
- `deploy/README.md` — Cloud deployment docs
