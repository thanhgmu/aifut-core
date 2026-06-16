# UI DESIGN — Developer Sandbox (apps/web)

> Bản thiết kế kiến trúc giao diện (THINK mode, chưa code). Khớp 1:1 với backend `apps/api/src/sandbox`.
> Cập nhật: 2026-06-16.

## 0. Backend contract đã có (nguồn sự thật)

Base path `/sandbox`, auth qua header `X-Tenant-Id` (+ `Authorization: Bearer` theo chuẩn `lib/auth`).

| Method | Path | Mục đích | Trả về |
|---|---|---|---|
| POST | `/sandbox` | Tạo sandbox (`label`, `ttlMs`, `env`, `template`) | `SandboxInstance` |
| GET | `/sandbox` | List sandbox của tenant | `SandboxInstance[]` |
| GET | `/sandbox/:id` | Chi tiết 1 sandbox | `SandboxInstance` |
| DELETE | `/sandbox/:id` | Deactivate | `{ deleted }` |
| GET | `/sandbox/:id/env` | Lấy toàn bộ env | `Record<string,string>` |
| PUT | `/sandbox/:id/env` | Set/merge env (`mode: merge\|replace`) | `SandboxInstance` |
| POST | `/sandbox/:id/execute` | Chạy thử connector (mô phỏng) | `SandboxRunTrace` |
| GET | `/sandbox/:id/traces` | List trace (mới nhất trước) | `SandboxRunTrace[]` |
| GET | `/sandbox/:id/traces/:runId` | Chi tiết 1 trace | `SandboxRunTrace` |

Action hỗ trợ: `ais.discovery`, `ais.action.invoke`, `ais.trigger.poll`, `ais.health.check`.
Env templates: `generic_rest`, `webhook`, `oauth`, `database`. Default env: `AIFUT_SANDBOX`, `LOG_LEVEL`, `NODE_ENV`...
Giới hạn: `SANDBOX_MAX_ENV_KEYS=256`, `SANDBOX_MAX_RUN_HISTORY=50`, TTL mặc định 30 phút.

> ⚠️ Backend hiện trả env **plain text** (không mask). Masking là việc của **UI layer** (client-side) — tài liệu này định nghĩa rõ ranh giới đó.

---

## 1. Cấu trúc file cần khởi tạo

```
apps/web/
├── app/developer/sandbox/
│   ├── page.tsx                      # Server shell + auth guard → render <SandboxWorkspace/>
│   └── [id]/page.tsx                 # (tùy chọn) deep-link tới 1 sandbox cụ thể
│
├── components/sandbox/
│   ├── sandbox-workspace.tsx         # "use client" — orchestrator: state, data fetch, layout 3 cột
│   ├── sandbox-selector.tsx          # Dropdown/list chọn sandbox + nút "New sandbox"
│   ├── sandbox-create-dialog.tsx     # Modal tạo sandbox (label, template, ttl)
│   ├── sandbox-env-form.tsx          # (1) Masked Variables Form
│   ├── execute-connector-panel.tsx   # (2) Execute Connector Panel
│   ├── sandbox-logs.tsx              # (3) Execution Logs & Traces Viewer
│   ├── trace-list.tsx               # Sidebar lịch sử run (feed cho sandbox-logs)
│   └── sandbox-status-badge.tsx      # active / expired / TTL countdown
│
├── lib/sandbox/
│   ├── api.ts                        # Typed client: gọi 9 endpoint trên + inject X-Tenant-Id
│   ├── types.ts                      # Mirror SandboxInstance / SandboxRunTrace / ...
│   └── mask.ts                       # Logic mask/secret detection client-side
│
└── hooks/
    ├── use-sandbox.ts                # CRUD + env + selected sandbox state
    └── use-sandbox-run.ts            # execute + poll traces + streaming buffer
```

Lý do tách `components/sandbox/*` thay vì 3 file phẳng: workspace cần chia sẻ state (`selectedSandboxId`, `tenantId`, `lastRunId`) giữa 3 khu vực → một orchestrator + sub-components là sạch nhất, đúng separation of concerns trong AGENTS.md.

---

## 2. Thiết kế chi tiết 3 khu vực

### (1) `sandbox-env-form.tsx` — Masked Variables Form

**Mục tiêu:** quản lý biến môi trường bảo mật, mặc định che giá trị nhạy cảm.

- **Bảng key/value editable**, mỗi dòng: `KEY` | `VALUE (masked)` | toggle 👁 reveal | nút xóa.
- **Secret detection** (`lib/sandbox/mask.ts`): tự coi là bí mật nếu key match regex
  `/(SECRET|TOKEN|KEY|PASSWORD|PWD|CREDENTIAL|PRIVATE|AUTH|CLIENT_SECRET)/i`.
  → Hiển thị `••••••••` + chỉ lộ 2 ký tự cuối (`••••ab`). Non-secret hiện plain.
- **Reveal có chủ ý**: toggle 👁 per-row; auto re-mask sau 15s hoặc khi blur (chống vai-nhìn-trộm). Default mode = HIỆN của state, nhưng **không bao giờ log giá trị secret ra console/trace UI**.
- **Phân nhóm**: "Default (read-only)" (AIFUT_SANDBOX, NODE_ENV...) tách khỏi "Custom".
- **Template loader**: dropdown chọn `generic_rest | webhook | oauth | database` → merge nhanh.
- **Save**: nút "Apply" gọi `PUT /sandbox/:id/env` với `mode=merge`; nút "Replace all" dùng `mode=replace` (confirm modal). Hiển thị counter `n/256 keys`.
- **Validation client**: chặn key trùng, key rỗng, ký tự không hợp lệ, vượt 256.
- **Trạng thái**: dirty indicator (chấm cam), optimistic update + rollback nếu API lỗi.
- **Bảo mật UI**: bật `autoComplete="off"`, `type="password"` cho ô secret khi masked; cấm copy toàn bộ env ra clipboard nếu chứa secret (chỉ copy từng field có xác nhận).

```
┌ Environment Variables  (12/256)  [+ Add]  [Template ▾]  [Replace all] ┐
│ ── Defaults (locked) ──                                               │
│  AIFUT_SANDBOX        true                                            │
│  NODE_ENV             development                                     │
│ ── Custom ──                                                          │
│  API_KEY              ••••••••3f   👁  🗑   ● dirty                   │
│  BASE_URL             https://api.acme.dev   🗑                        │
│                                          [ Discard ]  [ Apply env ]   │
└──────────────────────────────────────────────────────────────────────┘
```

### (2) `execute-connector-panel.tsx` — Execute Connector Panel

**Mục tiêu:** trigger chạy thử một action connector trong sandbox.

- **Action selector**: segmented control / dropdown 4 action (`ais.discovery`, `ais.action.invoke`, `ais.trigger.poll`, `ais.health.check`) — mỗi cái có mô tả ngắn + icon.
- **Request builder** (form theo action):
  - `method` (GET/POST/PUT/DELETE), `baseUrl`, `endpoint`, `timeoutMs` (default 30000).
  - `headers`: key/value editor nhỏ (X-Connector-Name gợi ý cho discovery).
  - `payload`: JSON editor (textarea monospace + nút "Format JSON" + validate; với `ais.action.invoke` gợi ý field `action_key`).
- **Presets per-action**: nút "Fill example" tự đổ payload mẫu (vd discovery không cần payload; action.invoke đổ `{ "action_key": "create_record" }`).
- **Run button** (▶ Execute) → `POST /sandbox/:id/execute`:
  - disabled khi không có sandbox active / JSON invalid.
  - hiển thị spinner + thời gian đang chạy (ms) realtime.
  - khi xong: đẩy `runId` lên `use-sandbox-run` → khu (3) tự stream trace mới.
- **Inline result summary**: badge `success/fail`, `statusCode`, `durationMs` ngay dưới nút (chi tiết đầy đủ ở khu 3).
- **Cảnh báo an toàn**: banner "Simulated execution — no production side effects" (đúng bản chất backend mock) + nếu có `baseUrl` thật → note "validation-only".

```
┌ Execute Connector ──────────────────────────────────────────────────┐
│ Action: ( discovery | invoke | poll | health )   [Fill example]      │
│ Method [POST▾]  Base URL [____]  Endpoint [____]  Timeout [30000]     │
│ Headers  X-Connector-Name = MyCRM                          [+]       │
│ Payload  { "action_key": "create_record" }            [Format JSON]  │
│ ⓘ Simulated — no production side effects                              │
│                                         [ ▶ Execute connector ]      │
│ → ✓ 200 · 142ms                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### (3) `sandbox-logs.tsx` — Execution Logs & Traces Viewer

**Mục tiêu:** terminal-style stream cho logs + xem vết lỗi/trace chạy ngầm.

- **Layout 2 phần**: trái = `trace-list.tsx` (lịch sử run, newest-first từ `GET /traces`), phải = chi tiết trace đang chọn.
- **Terminal stream pane** (`<pre>` mono, nền tối `#0b1020`, cuộn auto-bottom):
  - Render `trace.logs[]` từng dòng, tô màu theo prefix: `[SANDBOX]` xám, error đỏ, status xanh.
  - Typewriter/stream effect: khi run mới hoàn tất, đổ logs theo nhịp (giả lập streaming vì backend trả 1 lần) → trải nghiệm "terminal sống".
  - Toolbar: ⏸ autoscroll, 🔍 filter text, ⬇ download `.log`, 🗑 clear view, copy.
- **Trace detail (tabs)**:
  - **Logs** (mặc định) — stream trên.
  - **Result** — JSON viewer của `result.data` (collapsible tree, syntax highlight).
  - **Request** — echo `action`/`payload`/`headers` đã gửi.
  - **Env snapshot** — `envSnapshot` **đã mask** lại bằng `lib/sandbox/mask.ts` (không lộ secret trong trace).
  - **Meta** — `runId`, `startedAt`, `completedAt`, `durationMs`, `statusCode`.
- **Error/trace vết lỗi**: nếu `result.success=false` → banner đỏ + `result.error` + statusCode nổi bật; highlight dòng log lỗi.
- **Run history list**: mỗi item = action + badge status + duration + timestamp tương đối; click để load chi tiết; giới hạn hiển thị 50 (đúng MAX_RUN_HISTORY); poll nhẹ `GET /traces` mỗi 3s khi có run đang chạy, dừng poll khi idle (tránh bottleneck).

```
┌ Traces ───────────┬ Run a1b2 · ais.action.invoke · ✓200 · 142ms ─────┐
│ ✓ invoke   142ms  │ [Logs] Result  Request  Env  Meta                │
│ ✗ poll     11ms   │ ┌───────────────────────────────────────────────┐│
│ ✓ discovery 88ms  │ │ [SANDBOX] Action: ais.action.invoke           ││
│ ✓ health   60ms   │ │ [SANDBOX] Method: POST                        ││
│ ...               │ │ [SANDBOX] Simulating action invocation: ...   ││
│                   │ │ ▌                                              ││
│  [⬇ .log] [clear] │ └───────────────────────────────────────────────┘│
└───────────────────┴───────────────────────────────────────────────────┘
```

---

## 3. State / data flow

```
SandboxWorkspace (orchestrator)
  ├─ useSandbox():  tenantId(from auth) → list/create/select/delete + env CRUD
  └─ useSandboxRun(selectedId): execute() → runId → poll traces → buffer for terminal

  selectedSandboxId ─┬─→ EnvForm        (PUT /env)
                     ├─→ ExecutePanel   (POST /execute → emits runId)
                     └─→ LogsViewer     (GET /traces, /traces/:runId)
```

- **Tenant header**: `lib/sandbox/api.ts` đọc tenant từ `fetchAuthMe`/stored session, tự đính `X-Tenant-Id` + `Authorization` mọi request.
- **Empty states**: chưa có sandbox → CTA "Create your first sandbox"; sandbox hết hạn → badge expired + nút recreate.
- **TTL countdown**: `sandbox-status-badge` hiện đếm ngược tới `expiresAt`, cảnh báo khi <5 phút.

## 4. Style/convention (đồng bộ repo)

- Theo đúng inline-style theme của `app/developer/page.tsx`: nền `#0b1020`, text `#f5f7ff`, accent `#6d7cff`, border `rgba(255,255,255,0.06)`; status: success `#80e0a0`, warn `#ffb366`, error `#ff8080`, info `#66c4ff`.
- `"use client"` cho mọi component tương tác; `page.tsx` giữ shell tối giản.
- Reuse `Section`/badge pattern đã có ở developer portal để nhất quán; link "Sandbox" thêm vào tab/route của Developer Portal.

## 5. Phạm vi ngoài (ghi nhận, không làm ở slice UI này)

- Backend chưa persist (in-memory Map) → reload server mất sandbox. Khi cần bền vững: chuyển store sang DB/SQLite (slice backend riêng).
- Masking thực thi **client-side**; nếu cần ẩn secret cả ở tầng API response → cần thêm flag mask ở backend (`/env?mask=true`) — đề xuất riêng.
- Real-time logs hiện là giả-stream từ 1 response; nâng cấp SSE/WebSocket `/sandbox/:id/stream` là enhancement Phase sau.
```
