# AIFUT — CHIẾN LƯỢC DÒNG TIỀN: LẤY NGẮN NUÔI DÀI
> Cập nhật: 2026-06-14 | Kết hợp với STRATEGIC-DIRECTION.md và GAP-ANALYSIS.md

---

## I. TRIẾT HỌC CỐT LÕI

> **"Bán ngay những gì đã làm được — dùng tiền đó xây những gì chưa có."**

Ba nguyên tắc không thay đổi:
1. **Bán trước, build sau** — Service thủ công cho 10 khách đầu trước khi có product hoàn chỉnh
2. **Local-first = $0 infra** — OpenClaw là runtime engine, user machine là server
3. **AI margin là passive income sớm nhất** — Infrastructure đã có (AI governance module), chỉ thêm billing meter

---

## II. KIẾN TRÚC KỸ THUẬT TIẾT KIỆM CHI PHÍ

### Local-First Architecture

```
TIER 1 — Local (Chi phí $0/tenant)
  └── SQLite local DB (thay PostgreSQL cho single-user local mode)
  └── OpenClaw runtime (workflow execution engine, free)
  └── AIFUT API chạy local (NestJS lightweight process)
  └── Data 100% trên máy user — sovereign by default

TIER 2 — Sync layer (Chi phí ~$5-20/tháng cho toàn hệ thống)
  └── Cloudflare Workers (edge compute, $0.50/million requests)
  └── Cloudflare R2 (object storage, $0.015/GB/tháng)
  └── Encrypted diff sync — không upload raw data

TIER 3 — Cloud services (Chi phí per-usage, pass-through)
  └── AI API (pay per call, margin 30-50%)
  └── Marketplace registry (read-heavy, batch writes)
  └── Analytics aggregation (batch jobs, không realtime)

→ Total infra cost: $20-50/tháng cho 100 tenants
  vs $500-1,000/tháng nếu cloud-heavy
  → Tiết kiệm 90-95% chi phí vận hành
```

### OpenClaw là Execution Runtime của AIFUT

```
AIFUT (control plane)          OpenClaw (execution runtime)
─────────────────────          ─────────────────────────────
Workflow logic định nghĩa  →   Cron scheduler thực thi
AI integration intent      →   Browser automation lấy data
File processing workflow   →   File system access
Mobile push notification   →   Node connect (iOS/Android)
Multi-device sync          →   Session management

→ Không cần Lambda, không cần cloud functions
→ Workflow chạy trên máy user qua OpenClaw
→ Chi phí compute: $0 (dùng CPU của user)
```

**Quyết định: Tích hợp OpenClaw, không phát triển riêng.**
- Tiết kiệm 6-12 tháng build time
- $0 execution cost vs cloud functions
- OpenClaw team maintain infrastructure
- AIFUT tập trung vào business logic

### Multi-device cho một User
```
Mobile (OpenClaw node)
      ↕ encrypted sync
Desktop (AIFUT local runtime)
      ↕ encrypted sync  
Laptop (OpenClaw node)

→ Offline-first: làm việc không cần internet
→ Sync khi có mạng qua Cloudflare Workers
→ Conflict resolution: CRDT hoặc last-write-wins
```

---

## III. NGUỒN THU THEO THỜI GIAN

### THÁNG 1-3: Bootstrap (Ngay bây giờ)

#### A. AI Setup & Onboarding Service — BÁN NGAY
**Không cần product hoàn chỉnh. Thành/Minh tự làm thủ công.**

```
Gói AIFUT Spa Setup — 3,500,000đ (~$140)
  → Setup OpenClaw + AIFUT local trên máy khách
  → Config workflow: đặt lịch, Zalo reminder, feedback survey
  → Training 2 giờ
  → 1 tháng support

Gói AIFUT F&B Setup — 4,500,000đ (~$180)
  → Booking workflow, kitchen notification, loyalty basic
  → POS integration (nếu có MISA/KiotViet)

Gói AIFUT E-commerce Setup — 5,500,000đ (~$220)
  → Order flow, Zalo OA automation, inventory alert
```

**Target:** 10 khách × $160 avg = $1,600/tháng từ tháng 1
**Chi phí thực:** $0 (time của Thành + Minh)

---

#### B. Local License (One-time) — BÁN NGAY

```
AIFUT Local License — 2,990,000đ (~$120) one-time
  → Cài trên Windows/Mac của họ
  → Dữ liệu 100% local, không cloud
  → OpenClaw runtime included
  → Updates miễn phí 1 năm
  → Year 2+: renew 790,000đ/năm

AIFUT Local + Sync — 4,490,000đ (~$180) one-time + 99,000đ/tháng sync
  → Tất cả above + encrypted cloud backup
  → Multi-device access
```

**Tại sao bán được:** SME Việt Nam thích "mua đứt", ngại subscription, và data sovereignty là selling point thực sự.

---

#### C. Template Packs — BÁN NGAY

```
F&B Workflow Pack (10 templates)     — 490,000đ
Spa/Beauty Pack (8 templates)        — 490,000đ  
Freelancer Pack (6 templates)        — 390,000đ
E-commerce Pack (12 templates)       — 590,000đ
All-in-One Bundle (36 templates)     — 990,000đ
```

**Build time:** 1-2 tuần
**Chi phí:** $0 infra
**Revenue per sale:** 100% margin sau thời gian làm

---

#### D. AI Usage Margin — BẮT ĐẦU KHI CÓ 20+ USER

```
Khách dùng AIFUT AI: 1,000 calls/tháng
Cost thực (OpenAI/Claude API): ~$5
AIFUT charge: ~$7.50 (50% margin)
Net per khách: $2.50/tháng

50 khách → $125/tháng (passive, không cần làm gì thêm)
200 khách → $500/tháng
500 khách → $1,250/tháng
```

**Infrastructure đã có:** AI governance module (routing policy, budget policy, usage event tracking). Chỉ cần thêm billing meter.

---

### THÁNG 4-9: Growth (Sau khi auth + workflow engine xong)

#### E. Freemium → Pro Subscription

```
Free Tier (Local only)
  → 3 workflows active, 1 user, SQLite local
  → Không credit card
  → Mục đích: viral adoption

Pro Tier — 490,000đ/tháng ($20)
  → Unlimited workflows
  → Cloud backup + sync
  → Multi-device (mobile via OpenClaw)
  → AI included (500 calls/tháng)
  → Marketplace access

Team Tier — 990,000đ/tháng ($40)
  → 5 users
  → Shared workflow library
  → Basic analytics
  → Priority support
```

**Break-even:** 50 Pro tenants = $1,000/tháng > infra cost

---

### THÁNG 9-18: Scale

#### F. Reseller Program

```
AIFUT Reseller Partner — 2,000,000đ one-time fee
  → Mua license với giá sỉ: -40%
  → Bán lại cho SME khách của họ
  → Branded portal với logo của reseller
  → Commission 20% recurring

Target: 50 resellers × 2,000,000đ = 100,000,000đ one-time
+ Recurring commission từ khách của resellers
```

#### G. Marketplace Commission

```
Connector developer bán connector: AIFUT 30% / Dev 70%
Template creator: AIFUT 20% / Creator 80%
Consultant services: AIFUT 15% / Consultant 85%
```

---

## IV. DÒNG TIỀN THEO THỜI GIAN (Projection)

```
THÁNG 1-3 (Bootstrap phase)
────────────────────────────────────────────────────
Chi phí tháng:   ~$30 (Cloudflare, domain, tools)
Thu:
  Setup service:  10 khách × $160avg = $1,600
  Local license:  20 license × $120 = $2,400
  Templates:      50 sales × $20avg = $1,000
────────────────────────────────────────────────────
Tổng thu:        ~$5,000/tháng
Net:             ~$4,970/tháng → đủ tự sống ngay tháng 1

THÁNG 4-6 (Product launch)
────────────────────────────────────────────────────
Chi phí tháng:   ~$100 (server scale up)
Thu:
  Pro subs:       30 × $20 = $600/tháng
  Setup service:  $1,500/tháng
  AI margin:      $200/tháng
  Templates:      $500/tháng
────────────────────────────────────────────────────
Net:             ~$2,700/tháng recurring

THÁNG 7-12 (Growth)
────────────────────────────────────────────────────
Chi phí tháng:   ~$300
Thu:
  Pro subs:       100 × $20 = $2,000
  Reseller fee:   20 × $80 one-time/month-spread = $1,600
  AI margin:      $500
  Marketplace:    $300
────────────────────────────────────────────────────
Net:             ~$4,100/tháng → fund Phase 2 development

THÁNG 13-18 (Scale)
────────────────────────────────────────────────────
Chi phí tháng:   ~$500
Thu:
  Pro/Team subs:  200 × $25avg = $5,000
  Reseller:       $2,000
  Marketplace:    $1,000
  AI margin:      $1,500
────────────────────────────────────────────────────
Net:             ~$9,000/tháng → comfortable Phase 2 fund
```

---

## V. PRIORITY ACTION MAP — LẤY NGẮN TRƯỚC

```
NGAY BÂY GIỜ (tuần này)
  1. Tạo 3-5 template packs → bắt đầu bán
  2. Setup landing page đơn giản (có thể dùng Notion/Carrd)
  3. Onboard 2-3 khách đầu tiên bằng setup service thủ công
  4. Document pain points để guide build

SAU KHI AUTH FIX (ưu tiên kỹ thuật #1)
  5. Enable AI usage metering → AI margin bắt đầu chạy
  6. Local License packaging (installer script)
  7. Basic Pro tier billing

SAU KHI WORKFLOW ENGINE (ưu tiên kỹ thuật #2)
  8. Freemium tier launch
  9. Reseller program announce
  10. Marketplace v1

PHASE 2 FUNDING (từ revenue Phase 1)
  → AWL language, AIS standard, developer portal
  → Được fund bởi recurring revenue từ Phase 1
```

---

## VI. KẾT NỐI VỚI 3 GIAI ĐOẠN CHIẾN LƯỢC

| Giai đoạn | Revenue chính | Model |
|---|---|---|
| **Phase 1 (2026-2027)** | Setup service + Local license + AI margin + Pro subs | Service-led growth |
| **Phase 2 (2027-2028)** | Pro/Team subs + Marketplace commission + Reseller | Product-led growth |
| **Phase 3 (2028-2030)** | Enterprise + Sovereign tier + Ecosystem economy | Platform-led growth |

**Triết lý xuyên suốt:**
> Phase 1 revenue nuôi Phase 1 build
> Phase 2 revenue nuôi Phase 2 build  
> Phase 3 revenue nuôi Phase 3 build
> Không cần raise funding nếu execute đúng

---

*File này được Minh đọc khi đưa ra quyết định về feature priority — luôn ưu tiên feature tạo ra revenue sớm nhất.*
