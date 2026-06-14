# AIFUT — CHIẾN LƯỢC TRẢI NGHIỆM NGƯỜI DÙNG
> 5 câu hỏi chiến lược về UX, Cost, Accessibility, Freemium, và Security
> Cập nhật: 2026-06-14

---

## CÂU HỎI 1 — Làm thế nào để khách hàng thấy rõ lợi ích TRỰC QUAN?

### Vấn đề cốt lõi
Người dùng không mua "phần mềm" — họ mua **kết quả**. AIFUT phải làm cho kết quả hiện ra trước mắt họ ngay lập tức, trước khi họ hiểu hệ thống hoạt động như thế nào.

### Giải pháp: "Show Don't Tell" Framework

#### A. Live Demo Calculator (Ngay trên landing page)
```
[Bạn làm ngành gì?]  [F&B ▼]
[Mỗi ngày bạn nhận bao nhiêu đơn?]  [50]
[Bạn đang tốn bao nhiêu giờ/ngày cho việc nhắn tin thủ công?]  [2 tiếng]

→ AIFUT có thể tiết kiệm cho bạn:
   ✅ 730 giờ/năm xử lý đơn hàng
   ✅ ~36,500,000đ/năm chi phí nhân sự
   ✅ 0 đơn bị bỏ sót vì quên nhắn
   ✅ 98% khách nhận xác nhận trong 30 giây
```

#### B. Before/After Timeline
Hiển thị visual trực tiếp so sánh:
```
TRƯỚC KHI CÓ AIFUT          SAU KHI CÓ AIFUT
────────────────────         ────────────────────────
9:00 Khách đặt lịch          9:00 Khách đặt lịch
9:05 Nhân viên thấy          9:00:05 Zalo confirm tự động
9:10 Nhân viên nhắn          9:00:05 Lịch thêm tự động
9:15 Khách reply             8:00 (hôm sau) Nhắc tự động
9:20 Confirm xong            → Nhân viên chưa cần làm gì
→ 20 phút, 1 nhân sự         → 5 giây, 0 nhân sự
```

#### C. Live Workflow Preview (không cần đăng ký)
Người dùng gõ ngay trên trang chủ:
> *"Tôi muốn tự động nhắn Zalo khi có đơn Shopee mới"*

AIFUT hiển thị ngay **workflow diagram trực quan** — không cần đăng ký, không cần hiểu kỹ thuật.
Đây là conversion driver mạnh nhất.

#### D. Dashboard "Tiết kiệm hôm nay"
Mỗi khi user login, dashboard hiện ngay:
```
┌─────────────────────────────────────────────┐
│  Hôm nay AIFUT đã làm thay bạn:             │
│  ✅ 47 tin nhắn xác nhận đặt lịch           │
│  ✅ 12 nhắc nhở trước 2 tiếng              │
│  ✅ 8 survey feedback sau dịch vụ           │
│  ⏱️ Tiết kiệm ~3.5 giờ làm việc thủ công   │
│  💰 Tương đương ~175,000đ chi phí nhân sự   │
└─────────────────────────────────────────────┘
```

### Cần build:
- [ ] ROI calculator component (web landing)
- [ ] Workflow preview (no-login, NL input → diagram)
- [ ] "Savings dashboard" widget trên dashboard chính
- [ ] Before/after visualization per industry template

---

## CÂU HỎI 2 — Làm thế nào để TỐI ƯU CHI PHÍ cho khách hàng?

### Triết lý: Chi phí phải TỶ LỆ VỚI GIÁ TRỊ

Người dùng nhỏ trả ít, nhưng vẫn được dùng. Khi họ lớn lên → họ tự nhiên trả thêm.

### Mô hình Pricing Tối ưu

#### Tier 1 — Local Free (Mãi mãi miễn phí)
```
$0/tháng
  → 3 workflows active
  → 1 user
  → Dữ liệu 100% local (SQLite trên máy họ)
  → OpenClaw runtime included
  → Không cần internet để chạy
  
Chi phí AIFUT: $0 (chạy trên máy họ)
Mục đích: Adoption → word of mouth
```

#### Tier 2 — Starter (Người dùng ít tiền)
```
99,000đ/tháng (~$4)
  → 10 workflows
  → 1 user
  → Cloud backup (Cloudflare R2 — cực rẻ)
  → 500 AI calls/tháng
  → Mobile sync (1 điện thoại)
  
Chi phí AIFUT thực tế: ~$0.50-1/tháng
Margin: ~75-80%
```

#### Tier 3 — Pro
```
490,000đ/tháng (~$20)
  → Unlimited workflows
  → 3 users
  → Multi-device sync
  → 2,000 AI calls
  → Marketplace access
  → Priority support
```

#### Tier 4 — Team
```
990,000đ/tháng (~$40)
  → 10 users
  → Analytics
  → Custom domain
  → API access
  → Reseller sub-accounts
```

#### Tier 5 — Local License (One-time, cho người ngại subscription)
```
2,990,000đ one-time (~$120)
  → Tất cả Pro features
  → Chạy 100% local
  → Không phụ thuộc server AIFUT
  → Updates 1 năm
  → Year 2+: 790,000đ/năm renewal
```

### Tối ưu chi phí kỹ thuật cho khách hàng:
- **Local-first**: Workflow chạy trên máy họ → không tốn cloud compute
- **Selective sync**: Chỉ sync diff, không upload toàn bộ data → tiết kiệm bandwidth
- **Smart AI routing**: Tự động chọn model rẻ nhất phù hợp với task (AI governance module)
  - Simple task → dùng model nhỏ rẻ (GPT-4o-mini, Gemini Flash)
  - Complex task → model mạnh hơn
  - → Giảm 60-70% AI cost cho khách

### Cần build:
- [ ] Tier system + feature gating
- [ ] Local-first SQLite mode
- [ ] Smart AI model routing (cost-aware)
- [ ] Usage dashboard (khách thấy mình đang dùng bao nhiêu)
- [ ] One-time license packaging + installer

---

## CÂU HỎI 3 — Làm thế nào để DỄ SỬ DỤNG không cần hiểu kỹ thuật?

### Triết lý: Người dùng nghĩ bằng CÔNG VIỆC, không bằng CÔNG NGHỆ

Người chủ spa không nghĩ "tôi cần một webhook trigger với conditional branching". Họ nghĩ "tôi muốn khách tự động được nhắc 2 tiếng trước khi đến".

AIFUT phải nói ngôn ngữ của họ, không phải ngôn ngữ của developer.

### Giải pháp: 4 Tầng Usability

#### Tầng 1 — Ngôn ngữ tự nhiên (NL-first)
```
User gõ/nói: "Khi khách đặt xong thì nhắn Zalo cảm ơn 
              và nhắc lại 1 ngày trước"

AIFUT:
  1. Hiểu intent
  2. Tạo workflow diagram (visual)
  3. Hỏi: "Bạn muốn nhắn lúc mấy giờ?"
  4. User trả lời → Deploy

Không có code. Không có API. Không có setting phức tạp.
```

#### Tầng 2 — Template theo ngành (1-click setup)
Người dùng chọn:
```
[🍜 Nhà hàng / Quán ăn]
[💆 Spa / Thẩm mỹ viện]  
[🛒 Cửa hàng / E-commerce]
[📚 Trung tâm dạy học]
[🔧 Dịch vụ kỹ thuật]
[💼 Văn phòng / Agency]
```
→ AIFUT load sẵn 8-12 workflows phổ biến nhất của ngành đó
→ User chỉ cần bấm "Bật" từng workflow
→ Chỉnh sửa nhỏ nếu cần (tên shop, số điện thoại, giờ mở cửa)

#### Tầng 3 — Visual Workflow Builder (drag & drop)
Cho người muốn tự tạo workflow mà không muốn gõ text:
```
[Khi nào?] → [Làm gì?] → [Điều kiện?] → [Rồi làm gì nữa?]
   ↓              ↓            ↓               ↓
 Trigger      Action        Filter          Next step
(Có đơn mới) (Gửi Zalo)  (Nếu > 500k)    (Báo manager)
```
Mỗi node có hướng dẫn bằng tiếng Việt, ví dụ thực tế.

#### Tầng 4 — Advanced Mode (cho người biết kỹ thuật)
Với developer hoặc IT admin muốn full control:
- AWL (AIFUT Workflow Language) editor
- API access
- Custom code nodes
- Webhook configuration

### Onboarding phải dưới 5 phút:
```
Bước 1 (30s): "Bạn đang làm ngành gì?"
Bước 2 (60s): "Đây là 5 thứ khách hàng tương tự bạn hay dùng nhất"
Bước 3 (90s): Bật 1-2 workflow đầu tiên
Bước 4 (60s): Test thử ngay trong app
Bước 5 (30s): "Xong! AIFUT đang chạy cho bạn"
```
**Không có: import CSV, cấu hình database, setup API keys trong bước onboarding**

### Cần build:
- [ ] NL intent → visual workflow (production-grade, không chỉ preview)
- [ ] Industry template picker (onboarding step 1)
- [ ] Visual drag-drop workflow builder
- [ ] 5-minute onboarding wizard
- [ ] Contextual help: mỗi field đều có ví dụ thực tế bằng tiếng Việt
- [ ] "Explain this workflow" button (AI giải thích workflow đang làm gì)

---

## CÂU HỎI 4 — Làm thế nào để NGƯỜI DÙNG ÍT TIỀN vẫn dùng được?

### Triết lý: Barrier thấp nhất có thể — Revenue đến tự nhiên theo scale

#### A. Free tier thực sự miễn phí (bền vững)
Khác với nhiều SaaS "free" thực ra là trial 14 ngày:
```
AIFUT Free = Mãi mãi miễn phí, không cần credit card
Tại sao bền vững: Chạy trên máy họ → chi phí AIFUT = $0
```

#### B. Mobile-first cho người không có máy tính
Nhiều SME Việt Nam chỉ có điện thoại:
```
OpenClaw Android/iOS → AIFUT Mobile
  → Setup workflow bằng điện thoại
  → Nhận notification trên điện thoại
  → Xem báo cáo đơn giản
  → Không cần laptop/PC
```

#### C. Shared/Pooled compute cho người dùng nhỏ
Người dùng Starter tier không cần dedicated server:
```
Shared AIFUT runtime (multi-tenant):
  → 100 Starter users dùng chung 1 lightweight server
  → Chi phí mỗi user: ~$0.20-0.50/tháng cho AIFUT
  → Họ trả 99,000đ → margin vẫn cao
```

#### D. Community templates miễn phí
```
AIFUT Template Store:
  → Community-contributed templates: FREE
  → AIFUT official templates: FREE (basic tier)
  → Premium templates: 49,000đ - 199,000đ one-time
  
→ Người dùng ít tiền vẫn có workflows tốt từ community
```

#### E. Pay-as-you-go cho AI (không bị ép subscription)
```
Nạp credit khi cần:
  50,000đ = 500 AI calls (~2 cents/call)
  100,000đ = 1,200 AI calls (giảm 20%)
  500,000đ = 7,000 AI calls (giảm 30%)
  
→ Không bị "hết hạn" credit
→ Phù hợp người dùng không đều
```

#### F. Micro-business model (Việt Nam đặc thù)
```
Gói tháng:     99,000đ  (~2 bữa phở)
Gói quý:      270,000đ  (tiết kiệm 10%)
Gói năm:      990,000đ  (tiết kiệm 17%)

→ Ngưỡng tâm lý: dưới 100k/tháng dễ quyết định hơn
```

### Cần build:
- [ ] Free tier với local runtime (zero infra cost)
- [ ] Mobile app (OpenClaw integration cho iOS/Android)
- [ ] Shared runtime mode cho Starter tier
- [ ] Community template marketplace
- [ ] Credit top-up system (pay-as-you-go AI)
- [ ] VND pricing với local payment gateway (MoMo, VNPay, banking)

---

## CÂU HỎI 5 — Làm thế nào để MULTI-DEVICE, MULTI-STORAGE vẫn BẢO MẬT?

### Mô hình bảo mật: "Zero-Knowledge Architecture"

> AIFUT không cần biết nội dung data của bạn để vận hành hệ thống.

#### Kiến trúc End-to-End Encryption:
```
[Device A - Laptop]                    [Device B - Mobile]
    Data (plaintext)                       Data (plaintext)
         ↓                                      ↓
   [Encrypt với User Key]              [Encrypt với User Key]
         ↓                                      ↓
   [Encrypted blob]      →  Sync  ←    [Encrypted blob]
                          AIFUT Cloud
                        (chỉ thấy blob,
                         không thấy content)
```

**User Key:** Derived từ password của user (PBKDF2/Argon2)
**AIFUT server:** Không bao giờ có plaintext data
**Nếu server bị hack:** Hacker chỉ có encrypted blobs — vô dụng

#### Layers of Security:

**Layer 1 — Device Security**
```
→ SQLite local DB: encrypted at rest (SQLCipher)
→ OpenClaw credential store: OS keychain (Windows Credential Manager / macOS Keychain)
→ Auto-lock sau X phút không dùng
→ Biometric unlock cho mobile (Face ID / fingerprint)
```

**Layer 2 — Sync Security**
```
→ Transport: TLS 1.3 (tất cả kết nối)
→ Content: AES-256 encryption trước khi upload
→ Sync token: short-lived JWT (15 phút), refresh token stored locally
→ Device trust: mỗi device phải được approve bởi user lần đầu
```

**Layer 3 — Multi-device Trust Model**
```
Device A đã đăng nhập muốn thêm Device B:
  1. Device B tạo key pair
  2. Device B hiển thị QR code
  3. User scan QR bằng Device A (đã trust)
  4. Device A ký trust certificate cho Device B
  5. Device B được join với encrypted key exchange
  
→ Không có server nào trong middle có thể intercept
→ Giống Signal's device linking model
```

**Layer 4 — Connector Security (Zalo, Shopee, v.v.)**
```
→ OAuth tokens: stored encrypted, never in plaintext
→ Credential references: chỉ store ID reference, không store secret trực tiếp
→ Token rotation: tự động refresh trước khi hết hạn
→ Scope minimization: chỉ request đúng permissions cần thiết
→ Revocation: user có thể revoke bất kỳ connector nào instantly
```

**Layer 5 — Multi-Storage Security**
```
Nếu user lưu ở nhiều nơi (Local + Cloudflare R2 + Google Drive):
  → Mỗi storage location có encryption key riêng
  → Master key (user-controlled) dùng để derive storage keys
  → Storage provider không thể đọc content
  → Nếu một storage bị compromise → các storage khác không bị ảnh hưởng
```

**Layer 6 — Audit Trail (không thể chối)**
```
Mọi action đều được log:
  → WHO: user/device nào
  → WHAT: làm gì
  → WHEN: lúc nào
  → WHERE: từ IP/device nào
  
Log được sign bởi server key → không thể tamper
User có thể export full audit log của mình bất cứ lúc nào
```

### Compliance-ready:
```
→ GDPR: Right to deletion, data export, consent management
→ Vietnam PDPD (Personal Data Protection Decree): data residency option
→ ISO 27001 principles (for enterprise tier later)
→ SOC 2 principles (for regulated industries)
```

### Cần build:
- [ ] SQLCipher cho local SQLite encryption
- [ ] End-to-end encryption layer cho sync
- [ ] Device trust model (QR-based device pairing)
- [ ] Credential vault (encrypted, OS keychain integration)
- [ ] OAuth token management với auto-rotation
- [ ] Multi-storage key management
- [ ] Audit log với tamper-proof signing
- [ ] GDPR/PDPD compliance endpoints (delete, export)
- [ ] Security dashboard cho user (xem devices, sessions, permissions)

---

## TỔNG HỢP — BUILD PRIORITY MAP

```
NGAY BÂY GIỜ (ưu tiên tạo revenue + foundation)
  ①  ROI Calculator + Live workflow preview (landing page)
  ②  Industry template picker (onboarding)
  ③  Savings dashboard widget
  ④  Free tier local mode (SQLite)
  ⑤  Credit top-up system (payment VND)

Q3 2026 (sau khi auth + workflow engine xong)
  ⑥  5-minute onboarding wizard
  ⑦  Visual drag-drop workflow builder
  ⑧  SQLCipher local encryption
  ⑨  Device trust model
  ⑩  Smart AI cost routing

Q4 2026
  ⑪  Mobile app (OpenClaw integration)
  ⑫  E2E encryption sync layer
  ⑬  Community template marketplace
  ⑭  Tier system + feature gating
  ⑮  VND payment gateway (MoMo, VNPay)

2027
  ⑯  Multi-storage key management
  ⑰  Compliance module (GDPR, PDPD)
  ⑱  Audit trail với tamper-proof signing
  ⑲  Sovereign/enterprise security tier
```
