# STATUS.md — AIFUT Core

**Last updated:** 2026-06-27 23:23 GMT+7
**Active commit:** 5a182d0 (Phase 3 merged → main ✅)

---

## Runtime
- PostgreSQL :5432 ✅
- API :3002 ❌ (stopped)
- Web :3000 ❌ (stopped)

---

## Completed (Session 2026-06-27 — Phase 4 Implementation)

### Item 1: 🛠️ SAC Fix & Prisma Schema (Root Cause Resolved)
- **Fix provider contradiction**: Changed `schema.prisma` provider from `sqlite` → `postgresql` (matching actual PostgreSQL :5432, migration_lock.toml, and PrismaPg adapter)
- **New Phase 4 models** added to schema:
  - `DeveloperProfile` — developer identity on marketplace (name, bio, tier, skills, earnings)
  - `DeveloperSkill` — skills with 1-5 proficiency level
  - `MarketplaceOrder` — purchase transactions with revenue share tracking
  - `DeveloperEarning` — earnings from marketplace sales

### Item 2: 🧹 Sandbox Executor Refactor (No SAC Trigger)
- **Refactored** `sandbox-executor.service.ts` — replaced `child_process.spawn` with pure `vm` module
- JavaScript execution now runs **in-process** via `vm.Script.runInContext()` — no native binary spawn → **no Windows Smart App Control trigger**
- Python execution returns clear "not available" message (install Python locally to enable)
- Sandbox context stripped of dangerous globals (`require`, `process`, `Buffer`, `setTimeout`)

### Item 3: 👤 Developer Profile System (NEW)
- `developer-profile.service.ts` — full CRUD: register, update, get profile, get public profile by ID
- `developer-profile.controller.ts` — REST endpoints at `/v1/developer/profile`
- Skill management: add, update, remove skills with 1-5 level
- Auto tier calculation (Bronze → Silver → Gold → Platinum) based on listings, sales, rating
- Developer discovery API (search by skill, tier, country)
- Stats dashboard: total earnings (by type), marketplace stats, pending certifications
- Revenue share by tier: Bronze 70%, Silver 75%, Gold 80%, Platinum 85%

### Item 4: 💰 Marketplace Economics (NEW)
- `marketplace-order.service.ts` — purchase flow with:
  - Frozen fx rate snapshot
  - Revenue share calculation per developer tier
  - DeveloperEarning auto-creation on sale
  - Order tracking & duplicate prevention
  - Sales report for developers
- `marketplace-order.controller.ts` — REST endpoints at `/v1/marketplace/orders`
- Self-purchase prevention (can't buy own listing)

### Item 5: 📊 Analytics BI Engine (NEW)
- `analytics-bi.service.ts` — full implementation with:
  - Hourly aggregation from WorkflowExecution, AiUsageEvent, Invoice, Session
  - Daily platform benchmarks (avg, median, p90, p95) by industry
  - Platform health report (active tenants, growth, success rate, anomalies)
  - Tenant-specific analytics snapshots
- `analytics-cron.service.ts` — updated to call real analytics methods

### Item 6: 🔧 Module Wiring
- All 4 new services registered in their respective modules
- App.module.ts already imports all needed modules

---

## Phase 3 Merge — 2026-06-27 23:23
- `feature/phase3-developer-sandbox` merged → `main` (fast-forward, 119 files, +29032/−5150)
- Pushed to origin/main ✅

## Deploy Readiness Check
1. **`infra/airgap/setup.sh`**: Không có biến DOMAIN cố định. Dùng `localhost` mặc định, cần thêm domain thật nếu deploy production.
2. **`docker-compose.airgap.yml`**: Có volume mount `aifut_data:/data` cho SQLite + upload, `aifut_config:/config` cho config.
3. **`apps/api/.env.example`**: **Thiếu** VNPAY_TMN_CODE, MOMO_PARTNER_CODE và các biến payment gateway. Cần bổ sung.

## Payment Gateway Status
- **VNPay**: Default sandbox (`sandbox.vnpayment.vn`), IPN tại `/payments/vnpay/ipn`, cần `VNPAY_TMN_CODE` + `VNPAY_HASH_SECRET`.
- **MoMo**: Default test (`test-payment.momo.vn`), IPN tại `/payments/momo/ipn`, cần `MOMO_PARTNER_CODE` + `MOMO_ACCESS_KEY` + `MOMO_SECRET_KEY`.
- Cả 2 đang ở test mode (sandbox URL mặc định). Chưa có config production.
- `apps/api/.env.example` cần thêm các biến này.

## Next Critical Path (Phase 4 remaining ~15%)
- [ ] UI: Developer profile management page (Next.js)
- [ ] UI: Marketplace order history page
- [ ] UI: Analytics BI dashboard (admin panel)
- [ ] UI: Developer discovery browse page
- [ ] Run `prisma db push` (Thành manual)
- [ ] Build & verify runtime

---

## Blockers
- `prisma db push` needs to be run manually (thuộc ĐIỀU 1 — cấm chạy terminal)
