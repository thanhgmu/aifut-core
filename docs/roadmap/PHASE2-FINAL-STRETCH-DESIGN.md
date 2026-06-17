# PHASE 2 — FINAL STRETCH DESIGN

> **Mục tiêu:** Đưa Phase 2 từ ~86% lên **100% tuyệt đối**
> **HEAD hiện tại:** `79261d6` — `feat: complete phase 3 vnpay sdk gateway integration`
> **Trạng thái:** IDLE — Bản thiết kế kiến trúc, chưa implement
> **Người thiết kế:** Claude (XHigh Reasoning) — 2026-06-17 07:19 GMT+7
> **Lệnh:** `AIFUT THINK` — xuất design → DỪNG NGAY → IDLE

---

## I. TỔNG QUAN HAI THÀNH PHẦN CÒN LẠI

| # | Thành phần | Frontend File | Backend Impact | Prisma Impact |
|---|---|---|---|---|
| 1 | SDK Docs UI (Developer Documentation System) | `apps/web/app/docs/sdk/page.tsx` **NEW** | Có thể dùng lại `GET /developer/docs`, `GET /developer/sdks`, `GET /connectors/registry` hiện có | KHÔNG cần migration |
| 2 | Marketplace Multi-country Search | `apps/web/app/(dashboard)/marketplace/page.tsx` UPDATE + `apps/api/src/marketplace/` UPDATE | Thêm `region` filter vào `GET /marketplace/listings` | CẦN migration: thêm `region` field vào `MarketplaceListing` |

---

## II. KIẾN TRÚC SDK DOCS UI (`/docs/sdk`)

### 2.1 Vấn đề hiện tại

- **Đã có:** Developer portal tại `/developer` với 6 tab (Overview, AIS Spec, SDKs, Webhooks, API Reference, Roadmap) — dùng chung layout với portal dashboard.
- **Đã có:** `GET /developer/docs` trả về 39 API endpoints có đánh dấu `phase` + `auth`.
- **Đã có:** `GET /developer/sdks` trả về thông tin Node.js SDK, Python SDK, REST API.
- **Đã có:** `GET /connectors/registry` trả về 8 connectors trong `CONNECTOR_REGISTRY_FOUNDATION`.
- **Đã có:** AIS spec v0.1 draft (8 sections) tại endpoint `GET /developer/ais-spec`.
- **Đã có:** 12-item certification checklist.

> **Thiếu:** Một trang **SDK docs tương tác** dành riêng cho lập trình viên muốn tích hợp connector. Trang hiện tại `/developer` là portal overview, không có giao diện dạng tài liệu (docs) với code snippets song ngữ. Không có trang `/docs/sdk/`.

### 2.2 Thiết kế kiến trúc

#### 2.2.1 Next.js Route & File Structure

```
apps/web/app/docs/
├── layout.tsx                     # NEW — Server Component layout, metadata
└── sdk/
    ├── page.tsx                   # NEW — Client Component, SDK Docs Home
    ├── connector/
    │   └── [key]/
    │       └── page.tsx           # NEW — Dynamic connector detail page
    ├── api-reference/
    │   └── page.tsx               # NEW — Full API reference page
    └── quickstart/
        └── page.tsx               # NEW — Quickstart guide (optional)
```

#### 2.2.2 Component Tree (page.tsx)

```
<SDKDocsPage>                          # "use client" wrapper
├── <DocsHeader>                       # Breadcrumb + "SDK Documentation" title
├── <LanguageTabs>                     # TypeScript | JavaScript | cURL
│   ├── Tab: TypeScript                # @aifut/connector-sdk examples
│   ├── Tab: JavaScript                # Vanilla JS fetch() examples
│   └── Tab: cURL                      # curl command examples
├── <ConnectorDocCard>                 # Per connector from registry
│   ├── Connector header (key, name, category, auth modes)
│   ├── Code snippets (3 tabs) for:
│   │   - Authentication setup
│   │   - Action execution
│   │   - Webhook receive
│   │   - Error handling
│   ├── AIS compliance badge
│   └── "View detail" → /docs/sdk/connector/{key}
├── <ConnectorsSearchBar>             # Client-side filter by name/category
├── <QuickLinks>                      # AIS spec, API ref, sandbox, cert
└── <SDKCommandsAlert>                # npm install / pip install commands
```

#### 2.2.3 Data Sources (tận dụng API endpoints có sẵn)

| Dữ liệu | Endpoint | Cache strategy |
|---|---|---|
| Danh sách connectors | `GET /connectors/registry` → `REGISTRY_FOUNDATION` | Build-time hoặc first-load |
| AIS spec sections | `GET /developer/ais-spec` → `AIS_SPEC.sections` | Reference, lazy load |
| SDK packages | `GET /developer/sdks` | Build-time |
| API endpoints | `GET /developer/docs` | Build-time |
| Webhook docs | `GET /developer/webhooks` | Reference |

#### 2.2.4 Code Snippets Strategy

Mỗi connector trong registry có 4 nhóm code snippets, mỗi nhóm render 3 tab (TS/JS/cURL):

```
Types: "auth" | "action" | "webhook" | "error-handling"
Sub: [tab: "typescript" | "javascript" | "curl"]
```

**Logic sinh code snippet tại runtime (trên client):**
- Dùng `connector.key` + `connector.authModes` + `connector.capabilities` để render template snippet
- Không cần hardcode từng connector — tất cả đều sinh từ registry constants
- Template engine: Pure TypeScript template literals trong `lib/sdk-snippets.ts`

**Ví dụ sinh snippet cho connector X với auth mode "api-key":**

```typescript
// lib/sdk-snippets.ts — server-safe, portable

type SnippetLang = 'typescript' | 'javascript' | 'curl';
type SnippetType = 'auth' | 'action' | 'webhook';

const AUTH_TPL: Record<SnippetLang, string> = {
  typescript: `import { AisConnector } from '@aifut/connector-sdk';

const connector = new AisConnector({
  connectorKey: '{{key}}',
  auth: { type: '{{authMode}}', credentials: '...' },
});

// Discovery
const discovery = await connector.discover();
console.log('Capabilities:', discovery.capabilities);`,
  // ...
};
```

**ConnectorDetailPage (`/docs/sdk/connector/[key]`):**
- SSR fetch dựa trên `key` param
- Hiển thị:
  - Tất cả auth modes + hướng dẫn từng mode
  - Từng capability → snippet mẫu
  - Sync direction diagram (push/pull/bidirectional) — dạng text
  - Certification status (nếu có)
  - Link install từ marketplace (nếu đã publish)

#### 2.2.5 Giao diện (Dark Theme — đồng bộ toàn bộ AIFUT)

```
Layout:
├── Header: "AIFUT SDK Documentation"
├── Breadcrumb: Docs → SDK → Connector: {name}
├── Left sidebar (sticky): 
│   ├── Introduction
│   ├── Connectors (danh sách + search)
│   │   ├── Generic REST
│   │   ├── Webhook Bridge
│   │   ├── n8n Bridge
│   │   ├── Perfex CRM
│   │   ├── NexovaFlow
│   │   ├── Shopify
│   │   ├── Moodle
│   │   └── Zalo OA
│   ├── Quickstart
│   └── API Reference
├── Main content area:
│   ├── Code snippet block (3-tab switcher)
│   ├── Copy button (mỗi snippet)
│   └── Expandable AIS section
└── Footer: Link to sandbox, certification
```

#### 2.2.6 Các endpoint API cần bổ sung

**Không cần endpoint mới** nếu dùng dữ liệu từ các endpoint hiện có. Tuy nhiên, để tối ưu:

- `GET /developer/connector-snippets/:key` (tùy chọn) — trả về code snippets cho 1 connector, dạng JSON động. Nếu làm client-side template thì không cần.

**Khuyến nghị:** Client-side template generation — 0 backend change, 0 migration.

### 2.3 Files cần tạo / sửa

| File | Hành động | Kích thước ước tính |
|---|---|---|
| `apps/web/app/docs/layout.tsx` | **TẠO MỚI** — metadata + wrapper | ~20 dòng |
| `apps/web/app/docs/sdk/page.tsx` | **TẠO MỚI** — SDK docs home page | ~300-400 dòng |
| `apps/web/app/docs/sdk/connector/[key]/page.tsx` | **TẠO MỚI** — Connector detail | ~200-250 dòng |
| `apps/web/app/docs/sdk/api-reference/page.tsx` | **TẠO MỚI** — API ref table | ~250 dòng |
| `apps/web/app/docs/sdk/quickstart/page.tsx` | **TẠO MỚI** — Quickstart guide | ~150 dòng |
| `apps/web/lib/sdk-snippets.ts` | **TẠO MỚI** — Snippet templates | ~200 dòng |
| `apps/web/components/docs/` (dir) | **TẠO MỚI** — Thư mục UI components | — |
| `apps/web/components/docs/CodeTabs.tsx` | **TẠO MỚI** — 3-tab code block | ~100 dòng |
| `apps/web/components/docs/ConnectorCard.tsx` | **TẠO MỚI** — Connector doc card | ~80 dòng |
| `apps/web/components/docs/DocsSidebar.tsx` | **TẠO MỚI** — Sidebar nav | ~80 dòng |

**Tổng cộng:** ~1,400 dòng TypeScript, 0 Prisma migration, 0 backend API thay đổi.

---

## III. KIẾN TRÚC MARKETPLACE MULTI-COUNTRY SEARCH

### 3.1 Vấn đề hiện tại

- **Prisma schema:** `MarketplaceListing` có: `type`, `category`, `industry`, `tags`, `price`, `currency` — **KHÔNG có `region` field**.
- **Backend** `GET /marketplace/listings`: Hỗ trợ filter `type`, `category`, `industry`, search full-text trên `name`+`description`+`tags`. **Không hỗ trợ filter `region`.**
- **Search service** (`search.service.ts`): Chỉ index templates+ packs local — **không index marketplace listings** và không có region filter.
- **Frontend** `apps/web/app/marketplace/page.tsx`: filter bar chỉ có type buttons + sort dropdown. **Không có region filter.**
- **User yêu cầu:** Tìm kiếm marketplace listing theo region (VN, SG, US...) + full-text search kết hợp lọc.

### 3.2 Thiết kế kiến trúc

#### 3.2.1 Prisma Schema — Migration

**Cần thêm field `region` vào `MarketplaceListing`:**

```prisma
model MarketplaceListing {
  id              String    @id @default(cuid())
  tenantId        String?
  type            String    // 'connector', 'template', 'workflow'
  key             String    @unique
  name            String
  description     String?
  category        String?
  industry        String?
  region          String?   // NEW: 'VN', 'SG', 'US', 'TH', 'JP', 'GB', etc.
  price           Float     @default(0)
  currency        String    @default("VND")
  authorName      String?
  authorEmail     String?
  version         String    @default("1.0.0")
  tags            String[]  @default([])
  config          Json?
  downloads       Int       @default(0)
  rating          Float?
  isPublished     Boolean   @default(false)
  isOfficial      Boolean   @default(false)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  tenant          Tenant?           @relation(fields: [tenantId], references: [id], onDelete: SetNull)
  ratings         MarketplaceListingRating[]

  @@index([type, category])
  @@index([isPublished])
  @@index([industry])
  @@index([region])           // NEW — index for region filtering
  @@index([downloads])
}
```

**Migration commands:**
```bash
cd apps/api
npx prisma migrate dev --name add-marketplace-region-field --schema ./prisma/schema.prisma
```

#### 3.2.2 Backend — Marketplace Service (`marketplace.service.ts`)

**Sửa `MarketplaceListOptions`:**

```typescript
export interface MarketplaceListOptions {
  type?: string;
  category?: string;
  industry?: string;
  region?: string;            // NEW — lọc theo region
  search?: string;
  sort?: 'newest' | 'popular' | 'rating' | 'price_asc' | 'price_desc';
  publishedOnly?: boolean;
  page?: number;
  pageSize?: number;
}
```

**Sửa `listListings()` — thêm region filter:**

```typescript
// Trong method listListings(), sau các filter hiện có:
if (options.region) {
  where.region = options.region;  // exact match
}

// Full-text search giữ nguyên (name + description + tags)
```

**Sửa `SubmitListingInput`:**

```typescript
export interface SubmitListingInput {
  tenantId?: string;
  type: 'connector' | 'template' | 'workflow';
  key: string;
  name: string;
  description?: string;
  category?: string;
  industry?: string;
  region?: string;            // NEW
  price?: number;
  currency?: string;
  authorName?: string;
  authorEmail?: string;
  config?: any;
  tags?: string[];
}
```

**Sửa `submitListing()`:**

```typescript
// Trong data object của Prisma create:
data: {
  // ... existing fields
  region: input.region ?? null,   // NEW
  // ...
}
```

**Seed data mẫu (dùng trong seed script hoặc test):**

```typescript
// Các region mẫu cho listings (không cần seed riêng, 
// thêm region vào seed-demo.ts hoặc test case hiện có)
const REGION_OPTIONS = ['VN', 'SG', 'TH', 'US', 'GB', 'JP', 'KR', 'DE', 'AU', 'ID', 'MY', 'PH', 'CN', 'IN'];
```

#### 3.2.3 Backend — Marketplace Controller

**Sửa `GET /marketplace/listings` — thêm query param `region`:**

```typescript
@Get('listings')
async list(
  @Query('type') type?: string,
  @Query('category') category?: string,
  @Query('industry') industry?: string,
  @Query('region') region?: string,        // NEW
  @Query('search') search?: string,
  @Query('sort') sort?: string,
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
  @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize?: number,
) {
  return this.marketplace.listListings({
    type, category, industry, region, search,     // region added
    sort: (sort as any) ?? 'newest',
    publishedOnly: true,
    page: Math.max(1, page ?? 1),
    pageSize: Math.max(1, Math.min(100, pageSize ?? 20)),
  });
}
```

#### 3.2.4 Frontend — Marketplace Page

**File đích:** `apps/web/app/marketplace/page.tsx` (hiện tại)  
**User request gợi ý:** `apps/web/app/(dashboard)/marketplace/page.tsx` — có thể tạo route group mới hoặc cập nhật file hiện tại.

**Khuyến nghị:** Cập nhật file hiện tại `apps/web/app/marketplace/page.tsx` — không cần tạo route group mới vì marketplace không cần dashboard layout đặc thù. Nếu sau này cần dashboard layout, có thể migrate sau.

**Thay đổi frontend:**

1. **Thêm `region` state + region filter UI:**

```typescript
const [filterRegion, setFilterRegion] = useState("");   // NEW

// Region options — đồng bộ với multi-country deploy config
const REGION_OPTIONS = [
  { value: '', label: '🌍 All Regions' },
  { value: 'VN', label: '🇻🇳 Vietnam' },
  { value: 'SG', label: '🇸🇬 Singapore' },
  { value: 'TH', label: '🇹🇭 Thailand' },
  { value: 'JP', label: '🇯🇵 Japan' },
  { value: 'US', label: '🇺🇸 United States' },
  { value: 'GB', label: '🇬🇧 United Kingdom' },
  { value: 'KR', label: '🇰🇷 South Korea' },
  { value: 'DE', label: '🇩🇪 Germany' },
  { value: 'AU', label: '🇦🇺 Australia' },
  { value: 'ID', label: '🇮🇩 Indonesia' },
  { value: 'MY', label: '🇲🇾 Malaysia' },
  { value: 'PH', label: '🇵🇭 Philippines' },
  { value: 'CN', label: '🇨🇳 China' },
  { value: 'IN', label: '🇮🇳 India' },
];
```

2. **Thêm region filter vào fetch params:**

```typescript
const params = new URLSearchParams();
if (filterType) params.set("type", filterType);
if (filterRegion) params.set("region", filterRegion);   // NEW
if (search.trim()) params.set("search", search.trim());
params.set("sort", sort);
params.set("page", String(p));
params.set("pageSize", "20");
```

3. **Thêm region select dropdown vào filter bar UI:**

```tsx
{/* Region filter */}
<select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)} style={{
  padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.03)", color: "#9fb0ff", fontSize: 13, cursor: "pointer", outline: "none",
}}>
  {REGION_OPTIONS.map(r => (
    <option key={r.value} value={r.value} style={{ background: "#0b1020" }}>{r.label}</option>
  ))}
</select>
```

4. **Hiển thị region badge trên mỗi listing card** (nếu có):

```tsx
{item.region && (
  <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, 
    background: "rgba(255,255,255,0.05)", color: "#9fb0ff" }}>
    🌍 {item.region}
  </span>
)}
```

#### 3.2.5 Backend — Search Service Integration (Optional Enhancement)

Có thể mở rộng `search.service.ts` để index cả marketplace listings theo region, nhưng **không bắt buộc** cho Phase 2 stretch. Filter region trên `GET /marketplace/listings` đã đủ cho use case.

**Nếu làm thêm:**
- Thêm type `marketplace-listing` vào `SearchResult.type`
- Index marketplace listings vào `searchIndex` (gọi `GET /marketplace/listings?pageSize=999`)
- Cho phép filter `region` trên `GET /search` endpoint

### 3.3 Files cần sửa

| File | Hành động | Chi tiết |
|---|---|---|
| `apps/api/prisma/schema.prisma` | **SỬA** | Thêm `region` field + index vào `MarketplaceListing` |
| `apps/api/src/marketplace/marketplace.service.ts` | **SỬA** | Thêm `region` vào `MarketplaceListOptions`, `SubmitListingInput`, `listListings()`, `submitListing()` |
| `apps/api/src/marketplace/marketplace.controller.ts` | **SỬA** | Thêm `@Query('region')` vào `list()` handler |
| `apps/web/app/marketplace/page.tsx` | **SỬA** | Thêm region state, filter UI, region badge trên card |
| `apps/web/app/marketplace/page.tsx` | **TÙY CHỌN** | Thêm region badge vào listing card metadata |

**Không cần tạo file mới** cho thành phần này.

### 3.4 Migrations

```bash
cd apps/api
npx prisma migrate dev --name add-marketplace-region-field --schema ./prisma/schema.prisma
```

Migration sẽ:
1. Thêm cột `region` (nullable String) vào bảng `MarketplaceListing`
2. Thêm index `@@index([region])` cho query performance
3. Các listing hiện tại sẽ có `region = null` — không breaking change

---

## IV. TỔNG HỢP TÁC VỤ

### 4.1 Task List (ưu tiên giảm dần)

| # | Task | Module | Files | Effort |
|---|---|---|---|---|
| **P0** | Prisma migration: add `region` to MarketplaceListing | Schema + DB | `schema.prisma` + migration | 5 phút |
| **P1** | Backend: add `region` to MarketplaceService & Controller | API | `marketplace.service.ts`, `marketplace.controller.ts` | 15 phút |
| **P2** | Frontend: add region filter + badge to marketplace page | Web | `apps/web/app/marketplace/page.tsx` | 20 phút |
| **P3** | Create SDK Snippets library | Web | `apps/web/lib/sdk-snippets.ts` | 30 phút |
| **P4** | Create SDK Docs UI components | Web | `CodeTabs`, `ConnectorCard`, `DocsSidebar` | 30 phút |
| **P5** | Create SDK Docs page + sub-routes | Web | `docs/sdk/page.tsx`, `docs/sdk/connector/[key]/page.tsx` | 45 phút |
| **P6** | Create API Reference sub-page | Web | `docs/sdk/api-reference/page.tsx` | 20 phút |
| **P7** | Create Quickstart guide | Web | `docs/sdk/quickstart/page.tsx` | 15 phút |
| **P8** | Build verification + commit | CI | — | 10 phút |

**Tổng thời gian ước tính:** ~3 giờ (nếu code liên tục, không kể build pass)
**Tổng số file mới:** ~8 files (~1,400 dòng)
**Tổng số file sửa:** ~5 files (~100 dòng thay đổi)
**Prisma migrations:** 1

### 4.2 Pre-requisites & Dependencies

- **SDK Docs:** Không phụ thuộc vào marketplace và ngược lại — có thể chạy song song.
- **Prisma migration** phải chạy trước backend changes.
- **Backend changes** phải chạy trước frontend marketplace changes.
- **SDK Docs** không phụ thuộc backend changes.
- Tất cả đều non-breaking với codebase hiện tại.

### 4.3 Kiểm tra sau implement

```
Checklist SDK Docs:
├── [ ] /docs/sdk/ hiển thị danh sách 8 connectors từ registry
├── [ ] Mỗi connector có 3-tab code snippets (TS/JS/cURL)
├── [ ] Copy button copy đúng snippet
├── [ ] /docs/sdk/connector/:key hiển thị connector detail
├── [ ] Sidebar navigation hoạt động
├── [ ] Responsive trên mobile

Checklist Marketplace Multi-country:
├── [ ] Prisma migrate thành công, không lỗi
├── [ ] GET /marketplace/listings?region=VN trả về đúng listings
├── [ ] GET /marketplace/listings?region=INVALID trả về empty
├── [ ] Frontend region dropdown hiển thị
├── [ ] Chọn region → fetch API đúng params → render đúng items
├── [ ] Region badge hiển thị trên card (nếu có region)
├── [ ] Kết hợp region + type + search hoạt động

Checklist Chung:
├── [ ] npm run build (Turborepo) pass full
├── [ ] Không lỗi TypeScript strict
├── [ ] Git add + commit + push sạch
```

### 4.4 Rollback plan (nếu migration lỗi)

```bash
# Nếu migration gây lỗi
cd apps/api
npx prisma migrate reset --schema ./prisma/schema.prisma

# Revert backend changes
git checkout -- apps/api/src/marketplace/

# Revert frontend changes
git checkout -- apps/web/app/marketplace/page.tsx

# Xóa SDK docs nếu gây lỗi
Remove-Item -Recurse -Force apps/web/app/docs
Remove-Item apps/web/lib/sdk-snippets.ts
```

---

## V. TÀI LIỆU THAM KHẢO

- **Connector Registry Constants:** `apps/api/src/connectors.constants.ts` — 8 connectors, 10 categories, 5 auth modes
- **Developer API Data:** `apps/api/src/developer/developer.service.ts` — 39 API endpoints, 3 SDKs, AIS spec draft
- **Marketplace Service:** `apps/api/src/marketplace/marketplace.service.ts` — full CRUD + search + install + ratings
- **Marketplace Controller:** `apps/api/src/marketplace/marketplace.controller.ts` — 15 endpoints
- **Marketplace Constants:** `apps/api/src/marketplace/marketplace.constants.ts` — roadmap 13 features
- **Marketplace Frontend:** `apps/web/app/marketplace/page.tsx` — ~500 dòng inline-styled dark theme
- **Search Service:** `apps/api/src/search.service.ts` — template+pack search index
- **Search Frontend:** `apps/web/app/search/page.tsx` — full-text search + autocomplete
- **Developer Frontend:** `apps/web/app/developer/page.tsx` — 6-tab portal
- **Developer Constants:** `apps/api/src/developer/developer.constants.ts` — AIS spec v0.1 (8 sections)
- **Multi-Country Infra Design:** `docs/roadmap/EDGE-NETWORK-INFRA-DESIGN.md` (thực hiện hôm 2026-06-16)
- **GAP Analysis:** `docs/roadmap/GAP-ANALYSIS.md` (cập nhật 2026-06-14 — cần refresh sau Phase 2 hoàn tất)
- **STATUS.md hiện tại:** Phase 2 ~86% — đang thiếu SDK Docs UI + Marketplace multi-country search

---

**📌 KẾT THÚC BẢN THIẾT KẾ.**
**LỆNH TIẾP THEO:** Khi Thành nói `AIFUT GO` → thực thi tất cả task trên → commit `79261d6` + 1 → Phase 2: 100%.
**HIỆN TẠI TRỞ VỀ IDLE.**
