# E-INVOICE & VAT GENERATION SERVICE — Architecture Design (Phase 3)

> Mode: AIFUT THINK (thiết kế, chưa code). Cập nhật: 2026-06-16.
> Phân hệ: `apps/api` (NestJS). Phục vụ giai đoạn: Phase 3 (Scale / Operator-grade billing).
> Path đến revenue: TRỰC TIẾP — hóa đơn VAT hợp lệ là điều kiện bán B2B tại VN.

## 0. Bối cảnh codebase hiện tại (đã quét)

Đã có sẵn (KHÔNG dựng lại):
- `Invoice`, `PaymentTransaction`, `Subscription`, `SubscriptionPlan`, `BillingAccount`, `Tenant` (Prisma).
- `PaymentsWebhookService.finalize()` — điểm hội tụ duy nhất khi IPN/Webhook xác nhận thành công (Stripe / MoMo / VNPay).
- `SubscriptionActivatorService.activateFromInvoice()` — đã mark invoice `paid` + kích hoạt quota.
- `NotificationService` — gửi mail qua `nodemailer` (SMTP), có `NotificationLog`, template engine `renderInline`.

Khoảng trống cần lấp:
1. Chưa có khái niệm **VAT tách thuế** (Invoice chỉ có `amount` gộp, chưa có net/tax/gross).
2. Chưa có **mã số hóa đơn pháp lý** (ký hiệu + số tuần tự theo TT78/ND123), `Invoice.number` hiện chỉ là số nội bộ.
3. Chưa có **render PDF/HTML** hóa đơn.
4. Chưa có **hàng đợi (queue)** — toàn bộ mail đang chạy đồng bộ; cần outbox để retry an toàn khi IPN tới.

> ⚠️ Lưu ý pháp lý (nguyên tắc connector-not-monolith): Hóa đơn điện tử HỢP LỆ tại VN (TT78/2021 + NĐ123/2020) bắt buộc ký số + truyền XML lên Tổng cục Thuế qua nhà cung cấp T-VAN (Viettel/VNPT/MISA/EasyInvoice). Service này thiết kế PDF/HTML là **bản trình bày cho người đọc**; phần phát hành pháp lý đi qua một `FiscalProviderConnector` abstraction (tách rời, cắm sau). Không nhúng logic nhà cung cấp vào kernel.

## 1. Cấu trúc file

### Tạo mới — `apps/api/src/payments/e-invoice/`
| File | Vai trò |
|---|---|
| `e-invoice.module.ts` | Wire DI; import PrismaService, NotificationService. |
| `e-invoice.types.ts` | `VatBreakdown`, `EInvoicePayload`, `BuyerInfo`, `SellerInfo`, `InvoiceLineItem`. |
| `invoice-generator.service.ts` | **Core #1** — tính VAT + sinh mã hóa đơn duy nhất + tạo `EInvoiceRecord`. |
| `vat-calculator.util.ts` | Hàm thuần (pure) tách thuế đa thuế suất (10/8/5/0/exempt). Dễ unit-test. |
| `pdf-template.service.ts` | **Core #2** — biên dịch HTML template → PDF buffer. |
| `templates/invoice.hbs` | Template HTML hóa đơn (Handlebars), song ngữ VI/EN. |
| `invoice-mailer.service.ts` | **Core #3** — consumer outbox, đính kèm PDF, gọi NotificationService. |
| `invoice-outbox.processor.ts` | Poller (cron `@nestjs/schedule`) quét `InvoiceMailJob` PENDING → gửi, backoff retry. |
| `e-invoice.controller.ts` | `GET /invoices/:id/pdf` (tải lại), `POST /invoices/:id/reissue` (admin). |
| `fiscal-provider.connector.ts` | Interface T-VAN (no-op/stub mặc định) — phát hành pháp lý cắm sau. |

### Cập nhật
| File | Thay đổi |
|---|---|
| `prisma/schema.prisma` | Thêm `EInvoiceRecord`, `InvoiceMailJob`; thêm cột VAT vào `Invoice` (xem §5). |
| `payments-webhook.service.ts` | Sau `finalize()` thành công → gọi `invoiceGenerator.issueForInvoice(invoiceId)` (enqueue, KHÔNG gửi sync). |
| `subscription-activator.service.ts` | Khi mark invoice `paid`, trả về `{invoiceId, issued:false}` để generator hook vào (giữ separation of concerns). |
| `payments.module.ts` | `imports: [EInvoiceModule]`. |
| `notifications/notification.service.ts` | Thêm hỗ trợ `attachments` (nodemailer đã support, chỉ cần expose field). |

## 2. CORE #1 — Tính VAT + sinh mã số hóa đơn

`InvoiceGeneratorService.issueForInvoice(invoiceId, opts?)`

Logic:
1. Load `Invoice` + `Subscription.plan` + `BillingAccount` + `Tenant`.
2. **Tách thuế (delegate `vat-calculator.util`):** quy ước giá lưu trong hệ thống là giá ĐÃ gồm VAT (gross) theo thông lệ SaaS VN.
   - `net = round(gross / (1 + rate))`, `tax = gross - net`. Dùng làm tròn theo đồng (VND không lẻ), kiểm tra `net + tax === gross` (tự bù sai số làm tròn vào dòng cuối).
   - Hỗ trợ đa dòng đa thuế suất: cộng dồn `taxByRate[rate]` → khối "phân tách thuế suất" trên hóa đơn.
3. **Sinh mã hóa đơn duy nhất, idempotent & chống race:**
   - Ký hiệu pháp lý: `{form}{serial}` (vd `1C26TAA`) lấy từ cấu hình seller.
   - Số tuần tự: lấy qua **transaction + atomic counter** (`InvoiceCounter` per (tenant, serial, year)) để không nhảy số / không trùng dưới tải đồng thời.
   - `secureCode`: `HMAC-SHA256(secret, invoiceId|number|gross|tenantId)` cắt 12 ký tự → in QR tra cứu. Dùng `crypto` (đã import sẵn ở webhook service).
   - **Idempotency:** nếu `EInvoiceRecord` cho `invoiceId` đã tồn tại → return bản cũ (IPN có thể tới 2 lần). Đây là điểm an toàn cốt lõi.
4. Lưu `EInvoiceRecord` (status `ISSUED`), enqueue `InvoiceMailJob`.

Chữ ký:
```
issueForInvoice(invoiceId: string, opts?: { reissue?: boolean }): Promise<EInvoiceRecord>
computeVat(items: InvoiceLineItem[], priceMode: 'inclusive'|'exclusive'): VatBreakdown   // pure
nextInvoiceNumber(tx, tenantId, serial, year): Promise<string>                            // atomic
```

## 3. CORE #2 — Render PDF/HTML

`PdfTemplateService.renderInvoicePdf(record): Promise<{ pdf: Buffer; html: string }>`

Logic:
1. Build view-model: `seller` (MST, địa chỉ, tài khoản), `buyer` (từ `BillingAccount.billingEmail` + tenant profile), `lines` (gói Workspace Subscription: tên plan, kỳ hạn, đơn giá net), khối VAT (§2), tổng tiền bằng chữ (`numberToVietnameseWords`), `secureCode` → QR.
2. Compile `templates/invoice.hbs` (Handlebars) → HTML.
3. HTML → PDF. **Quyết định thư viện:** dùng `puppeteer` nếu đã có (browser tool runtime) HOẶC `pdf-lib`/`@react-pdf` để tránh phụ thuộc Chromium nặng. Khuyến nghị: **playwright-core/puppeteer dùng chung Chromium của OpenClaw node** (local-first, 0 chi phí thêm). Fallback: trả HTML khi không có engine (degrade an toàn, không crash queue).
4. Trả buffer cho mailer + lưu tham chiếu file (local storage / tenant storage policy — tôn trọng `TenantStoragePolicy`).

Chữ ký:
```
renderInvoiceHtml(vm: InvoiceViewModel): string
renderInvoicePdf(record: EInvoiceRecord): Promise<{ pdf: Buffer; html: string; bytes: number }>
```

## 4. CORE #3 — Automated Invoice Mailer (qua Queue)

Hàng đợi: **DB-backed outbox** (`InvoiceMailJob`), KHÔNG dùng Redis/BullMQ → đúng nguyên tắc local-first, lean (CASHFLOW-STRATEGY). Poller bằng `@nestjs/schedule` (cron mỗi 30–60s) + lock optimistic.

Flow:
1. Webhook xác nhận `paid` → `issueForInvoice()` enqueue `InvoiceMailJob{ status: PENDING, attempts: 0 }`. **Mailer KHÔNG chạy trong request webhook** (trả 200 cho gateway nhanh, tránh timeout IPN).
2. `InvoiceOutboxProcessor` quét PENDING/`nextRetryAt <= now`:
   - `render PDF` (Core #2) → `NotificationService.send({ channel:'email', to: billingEmail, template:'invoice-issued', attachments:[{filename, content:pdf}] })`.
   - Thành công → `SENT`, ghi `NotificationLog`.
   - Lỗi → `attempts++`, `nextRetryAt = now + backoff(2^n)`, tối đa N lần → `FAILED` + alert admin. **Không retry vô hạn** (tuân thủ anti-loop safeguard).
3. Idempotency key = `invoiceId` → không gửi trùng dù IPN lặp.

Chữ ký:
```
enqueue(invoiceId: string): Promise<InvoiceMailJob>
processPending(batch = 20): Promise<{ sent: number; failed: number; retried: number }>   // cron
sendOne(job: InvoiceMailJob): Promise<DeliveryResult>
```

## 5. Thay đổi schema (Prisma)

```prisma
model Invoice {
  // ... giữ nguyên ...
  netAmount   Float?   // chưa VAT
  taxAmount   Float?   // tiền VAT
  taxRate     Float?   @default(0.10)
  einvoice    EInvoiceRecord?
}

model EInvoiceRecord {
  id            String   @id @default(cuid())
  invoiceId     String   @unique
  tenantId      String
  number        String   // số pháp lý đầy đủ
  serial        String   // ký hiệu vd 1C26TAA
  secureCode    String   // HMAC tra cứu / QR
  netAmount     Float
  taxAmount     Float
  grossAmount   Float
  taxBreakdown  Json     // {"0.10": {net,tax}, "0.08": {...}}
  status        String   @default("ISSUED") // ISSUED, FISCAL_SUBMITTED, FISCAL_CONFIRMED, CANCELLED
  fiscalRef     String?  // mã CQT trả về (khi cắm T-VAN)
  pdfStoragePath String?
  issuedAt      DateTime @default(now())
  invoice       Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  @@index([tenantId, issuedAt])
}

model InvoiceMailJob {
  id           String   @id @default(cuid())
  invoiceId    String   @unique
  tenantId     String
  status       String   @default("PENDING") // PENDING, SENT, FAILED
  attempts     Int      @default(0)
  nextRetryAt  DateTime?
  lastError    String?
  sentAt       DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([status, nextRetryAt])
}

model InvoiceCounter {  // atomic số tuần tự
  id        String @id @default(cuid())
  tenantId  String
  serial    String
  year      Int
  current   Int    @default(0)
  @@unique([tenantId, serial, year])
}
```

## 6. Thứ tự triển khai khi nhận `AIFUT GO`
1. Schema migration (Invoice cols + 3 model mới) — serialize, có migration risk.
2. `vat-calculator.util` + unit test (pure, an toàn nhất, làm trước).
3. `invoice-generator.service` (mã số + idempotency).
4. `pdf-template.service` + template.
5. `invoice-outbox.processor` + `invoice-mailer.service`.
6. Hook `payments-webhook.service.finalize()` → enqueue.
7. `fiscal-provider.connector` stub (để Phase 3.x cắm T-VAN).

## 7. Rủi ro / cần Thành quyết
- **Giá lưu là gross hay net?** Mặc định thiết kế: gross (đã gồm VAT). Cần xác nhận.
- **PDF engine:** Chromium dùng chung (nặng nhưng đẹp) vs pdf-lib (nhẹ, layout thủ công). Khuyến nghị Chromium-shared.
- **Phát hành pháp lý T-VAN:** chọn nhà cung cấp (Viettel/VNPT/MISA) — quyết định ở bước sau, hiện chỉ để interface.
