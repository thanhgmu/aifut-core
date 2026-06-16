# AIFUT — MASTER STRATEGY INDEX
> Entry point cho tất cả chiến lược. Đọc file này trước mọi quyết định.
> Cập nhật: 2026-06-15

---

## ⚡ MINH ĐỌC FILE NÀY ĐẦU MỖI SESSION LIÊN QUAN ĐẾN AIFUT

---

## I. BẢN ĐỒ CHIẾN LƯỢC (5 file, đọc theo thứ tự này)

```
MASTER-STRATEGY-INDEX.md  ← Bạn đang ở đây
         ↓
┌─────────────────────────────────────────────────────────┐
│ 1. STRATEGIC-DIRECTION.md    — LA BÀN DÀI HẠN          │
│    Tại sao AIFUT tồn tại, 3 giai đoạn, 6 nguyên tắc   │
├─────────────────────────────────────────────────────────┤
│ 2. GAP-ANALYSIS.md           — HIỆN TRẠNG VS MỤC TIÊU │
│    Đang ở đâu, thiếu gì, critical path                 │
├─────────────────────────────────────────────────────────┤
│ 3. CASHFLOW-STRATEGY.md      — DÒNG TIỀN               │
│    Lấy ngắn nuôi dài, revenue từ ngày 1, infra cost   │
├─────────────────────────────────────────────────────────┤
│ 4. USER-EXPERIENCE-STRATEGY.md — UX + SECURITY         │
│    ROI visibility, accessibility, pricing, security    │
└─────────────────────────────────────────────────────────┘
```

**Đường dẫn tuyệt đối:**
- `C:\Users\Admin\.openclaw\workspace\aifut-core\docs\roadmap\STRATEGIC-DIRECTION.md`
- `C:\Users\Admin\.openclaw\workspace\aifut-core\docs\roadmap\GAP-ANALYSIS.md`
- `C:\Users\Admin\.openclaw\workspace\aifut-core\docs\roadmap\CASHFLOW-STRATEGY.md`
- `C:\Users\Admin\.openclaw\workspace\aifut-core\docs\roadmap\USER-EXPERIENCE-STRATEGY.md`

**Mirror tại D:\TARGET AIFUT\** (tất cả 4 file trên)

**Trạng thái hiện tại (chi tiết ở STATUS.md): Phase 1 ~98%, Phase 2 ~55%**

---

## II. TÓM TẮT CHIẾN LƯỢC (không cần đọc full files để biết hướng đi)

### 🎯 AIFUT là gì?
Control plane AI-native, sovereign, multi-tenant cho operator/SME — đặc biệt ở Đông Nam Á và thị trường mới nổi. OpenClaw là local execution runtime.

### 🗺️ 3 Giai đoạn (2026–2030)

| Giai đoạn | Thời gian | Mục tiêu | Đo lường |
|---|---|---|---|
| **1. Become Indispensable** | 2026–2027 | Data lock-in + network effects + NL→Deploy | 100+ tenant, churn <5% |
| **2. Own the Standard** | 2027–2028 | AIS spec, AWL language, industry templates | 1000+ tenant, AIS adopted |
| **3. Control Intelligence** | 2028–2030 | Cross-tenant AI, proactive agents, ecosystem | 10000+ tenant, ecosystem 40% rev |

### 💰 Dòng tiền ngay bây giờ (không cần đợi product hoàn chỉnh)
1. **Setup service thủ công:** $160avg × 10 khách = $1,600/tháng từ tháng 1
2. **Local license one-time:** $120-180, SME Việt Nam thích mua đứt
3. **Template packs:** $20-40/pack, 100% margin — 50 templates sẵn sàng bán
4. **AI usage margin:** 30-50% trên mọi AI call (billing meter + VNPay/MoMo gateways ready)

### 🏗️ Kiến trúc tiết kiệm
- **Local-first:** SQLite local + Cloudflare Workers sync = $20-50/tháng cho 100 tenants
- **OpenClaw = execution runtime** (không build riêng, không cần Lambda/cloud functions)
- **Multi-device:** OpenClaw node-connect cho iOS/Android/macOS

### 🔒 Security model
- Zero-knowledge architecture: server không thấy plaintext data
- E2E encryption với user-controlled keys
- Device trust model (QR-based pairing như Signal)
- SQLCipher cho local encryption

---

## III. TRẠNG THÁI HIỆN TẠI (cập nhật 2026-06-15)

### ✅ ĐÃ HOÀN THÀNH (Phase 1)
```
 ① Auth fix (JWT + tenant + member)           ✅
 ② Workflow execution engine                   ✅
 ③ Connector execution runtime                 ✅
 ④ Notification (6 channels, 35 templates)     ✅
 ⑤ Backup execution thực sự                    ✅
 ⑥ Billing / Subscription foundation           ✅
 ⑦ Marketplace v1                              ✅
 ⑧ Reseller v1                                 ✅
 ⑨ Affiliate system                            ✅
 ⑩ 50 Industry templates (15+ industries)      ✅
 ⑪ Pricing + billing meter + usage tracking    ✅
 ⑫ Onboarding wizard                           ✅
 ⑬ Feature gating                              ✅
 ⑭ Local SQLite mode                           ✅
 ⑮ NL→Deploy bridge                            ✅
```

### ✅ ĐÃ LÀM (Phase 2 items)
```
 ⑯ AWL v0.1 (spec + interpreter + playground)  ✅
 ⑰ VNPay + MoMo payment gateways               ✅
 ⑱ Developer portal (AIS spec, SDKs, webhooks)  ✅
 ⑲ Node.js connector SDK                        ✅
 ⑳ Python connector SDK                         ✅
 ㉑ Search engine (full-text, autocomplete)      ✅
 ㉒ Analytics service                           ✅
 ㉓ API key management                          ✅
 ㉔ Prod deployment stack (Docker, CI/CD)        ✅
 ㉕ Multi-currency billing (7 currencies)        ✅
 ㉖ Localization engine (7 languages)            ✅
 ㉗ Connector certification program              ✅
```

### 🟡 CÒN LẠI (Phase 2-3)
```
 ㉘ Developer sandbox environment               📅 Q4 2026
 ㉙ API analytics dashboard                     📅 Planned
 ㉚ Community connector marketplace              🔄 Next (frontend done, backend depth needed)
 ㉛ Multi-country deployment config              ✅ Done
 ㉜ Localization content depth                   ✅ Done (325+ keys, 7 languages)
 ㉝ Connector SDK PyPI publish                   ✅ Pipeline ready
```

---

## IV. CRITICAL PATH — LÀM GÌ TIẾP THEO

### Phase 1 đã hoàn thành. Chuyển sang Phase 2:

### 🟠 Phase 2 Core
```
① Developer sandbox environment (isolated test env for connectors)
② API analytics dashboard (usage stats for devs)
③ Community connector marketplace (user-submitted connectors)
④ Multi-country deployment config (region-aware infra)
```

### 🟡 Phase 2 Revenue (song song)
```
⑤ Connector SDK PyPI publish (Python package) — ✅ Pipeline ready
⑥ Localization content depth (full UI translation for 7 languages, 325+ keys) — ✅ Done
⑦ Connector certification badge distribution
```

---

## V. NGUYÊN TẮC BẤT BIẾN (không bao giờ vi phạm)

1. **Tenant sovereignty first** — data luôn trong tay tenant
2. **Non-technical usability** — nếu không biết code không dùng được = chưa xong
3. **Multi-tenancy as kernel** — không phải add-on
4. **Connector model, not monolith** — Perfex, Salesforce là connectors
5. **AI-native, not AI-sprinkled** — AI là cách platform vận hành
6. **Sovereign by default** — security là mặc định, không phải option trả thêm
7. **Local-first, cloud-optional** — chạy offline trước, sync khi có internet
8. **Revenue-aware development** — mỗi feature phải có path đến revenue

---

## VI. QUYẾT ĐỊNH ĐÃ LÀM (không cần hỏi lại)

| Quyết định | Lý do |
|---|---|
| OpenClaw = execution runtime, không build riêng | Tiết kiệm 12 tháng build, $0 execution cost |
| SQLite local thay PostgreSQL cho single-user | $0 infra, sovereign, offline-first |
| Cloudflare Workers thay AWS | 95% cheaper, edge-native |
| Tích hợp OpenClaw node-connect | Multi-device miễn phí |
| Local License one-time trước SaaS | Phù hợp tâm lý SME Việt Nam |
| Free tier mãi mãi miễn phí | Acquisition strategy, chi phí $0 |
| E2E encryption zero-knowledge | Sovereign by default |
| Connector certification program | Marketplace quality gate |
| VNPay + MoMo payment gateways | Vietnam payment infrastructure |

---

## VII. CẬP NHẬT FILE NÀY KHI

- Có quyết định kiến trúc mới quan trọng
- Milestone lớn hoàn thành (update trạng thái)
- Thành thay đổi định hướng chiến lược
- Có nguồn thu mới hoặc thay đổi pricing

---

## VIII. SELF-CHECK TRƯỚC KHI IMPLEMENT

Trước khi viết bất kỳ code nào, Minh phải tự hỏi:

```
1. Feature này phục vụ giai đoạn nào? (1/2/3)
2. Feature này có path đến revenue không? (nếu không, có nên làm không?)
3. Feature này có vi phạm nguyên tắc bất biến nào không?
4. Feature này có thể làm với local-first approach không?
5. Feature này có thể được làm bởi user phi kỹ thuật không?
6. Chi phí infra của feature này là bao nhiêu?
```

---

*"Tính chi phối không đến từ quy mô tuyệt đối — mà đến từ việc trở thành tầng mà mọi người khác phải đi qua."*
