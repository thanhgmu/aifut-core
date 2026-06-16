/**
 * Invoice Mailer Service — E-Invoice
 * ====================================
 * Hàng đợi DB-backed gửi email hóa đơn điện tử cho khách hàng.
 *
 * Kiến trúc Outbox Pattern:
 *   - Mỗi yêu cầu gửi mail được ghi vào bảng `NotificationLog` (channel=EMAIL)
 *     với trạng thái PENDING và metadata chứa thông tin hóa đơn.
 *   - `InvoiceOutboxProcessor` (poller định kỳ) quét các bản ghi PENDING,
 *     gọi `send()` để gửi mail thực tế.
 *   - Backoff retry có giới hạn (3 lần: 30s → 5ph → 30ph) chống infinite loop.
 *   - Gửi mail qua Nodemailer với file HTML hóa đơn đính kèm.
 *
 * Yêu cầu biến môi trường (SMTP):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE
 *
 * Lưu ý PDF:
 *   Hiện tại file đính kèm là HTML (đủ dùng cho hầu hết email client).
 *   Để tạo PDF thật, cài puppeteer/html-pdf và thay thế `generateAttachment()`.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import * as nodemailer from 'nodemailer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Cấu hình một job gửi mail hóa đơn (tồn tại dưới dạng bản ghi NotificationLog). */
export interface InvoiceMailJob {
  /** ID của bản ghi NotificationLog. */
  logId: string;
  /** Tenant ID. */
  tenantId: string;
  /** Email người nhận. */
  to: string;
  /** Tiêu đề email. */
  subject: string;
  /** ID của bản ghi EInvoice. */
  eInvoiceId: string;
  /** Số hóa đơn (hiển thị). */
  invoiceNumber: string;
  /** ID hóa đơn Invoice (billing). */
  invoiceId: string;
  /** Số lần retry đã thực hiện. */
  retryCount: number;
  /** Số lần retry tối đa. */
  maxRetries: number;
  /** Thời gian retry tiếp theo (ISO string, null nếu chưa lên lịch). */
  nextRetryAt: string | null;
  /** Lỗi lần chạy trước (null nếu chưa thất bại). */
  lastError: string | null;
}

/** Kết quả gửi một mail. */
export interface MailDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// SMTP Transport Helper
// ---------------------------------------------------------------------------

function createSmtpTransport(): nodemailer.Transporter | null {
  const host = process.env['SMTP_HOST'];
  if (!host) return null;

  const port = parseInt(process.env['SMTP_PORT'] || '587', 10);
  const user = process.env['SMTP_USER'] || '';
  const pass = process.env['SMTP_PASS'] || '';
  const secure = process.env['SMTP_SECURE'] === 'true';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
}

const DEFAULT_FROM = process.env['SMTP_FROM'] || 'invoice@aifut.dev';
const DEFAULT_SUBJECT = process.env['INVOICE_MAIL_SUBJECT'] || 'Hóa đơn điện tử AIFUT';

// ---------------------------------------------------------------------------
// Attachment Helpers
// ---------------------------------------------------------------------------

/**
 * Tạo file đính kèm từ nội dung HTML của hóa đơn.
 *
 * Hiện tại đính kèm dưới dạng .html (email client sẽ hiển thị inline).
 * Khi có thư viện PDF (puppeteer/html-pdf), có thể chuyển sang .pdf thật.
 *
 * @param htmlContent - Nội dung HTML hóa đơn (từ EInvoice.htmlContent).
 * @param filename    - Tên file (VD: "HD-1K24TAA-00000123.html").
 */
function generateAttachment(htmlContent: string, filename: string): nodemailer.Attachment {
  return {
    filename,
    content: htmlContent,
    contentType: 'text/html; charset=utf-8',
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class InvoiceMailerService {
  private readonly logger = new Logger(InvoiceMailerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── 1. Enqueue ──────────────────────────────────────────────────────────

  /**
   * Tạo một job gửi mail hóa đơn mới (bản ghi NotificationLog, PENDING).
   *
   * Idempotent: nếu đã tồn tại PENDING mail cho cùng (invoiceId, to),
   * trả về logId cũ thay vì tạo trùng.
   *
   * @param tenantId    - Tenant của hóa đơn.
   * @param invoiceId   - ID Invoice (billing).
   * @param eInvoiceId  - ID EInvoice (hóa đơn điện tử).
   * @param to          - Email người nhận.
   * @param invoiceNumber - Số hóa đơn (cho subject).
   * @param subject     - Tiêu đề mail (tùy chọn, mặc định DEFAULT_SUBJECT).
   * @returns           - logId của bản ghi vừa tạo.
   */
  async enqueue(
    tenantId: string,
    invoiceId: string,
    eInvoiceId: string,
    to: string,
    invoiceNumber: string,
    subject?: string,
  ): Promise<string> {
    // Idempotent: nếu đã có PENDING mail cho invoiceId + to, dùng cái cũ.
    const existing = await this.prisma.notificationLog.findFirst({
      where: {
        channel: 'EMAIL',
        to,
        status: 'PENDING',
        // metadata chứa invoiceId → filter JSON
        metadata: { path: ['invoiceId'], equals: invoiceId },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      this.logger.log(`Reusing existing PENDING mail job: ${existing.id} (invoice=${invoiceId}, to=${to})`);
      return existing.id;
    }

    const log = await this.prisma.notificationLog.create({
      data: {
        tenantId,
        channel: 'EMAIL',
        to,
        subject: subject ?? DEFAULT_SUBJECT,
        status: 'PENDING',
        metadata: {
          invoiceId,
          eInvoiceId,
          invoiceNumber,
          retryCount: 0,
          maxRetries: 3,
          nextRetryAt: null,
          lastError: null,
        },
      },
    });

    this.logger.log(`Enqueued invoice mail job: ${log.id} (invoice=${invoiceId}, to=${to})`);
    return log.id;
  }

  // ── 2. Send (thực tế) ───────────────────────────────────────────────────

  /**
   * Gửi mail cho một NotificationLog cụ thể.
   *
   * Quy trình:
   *   1. Đọc NotificationLog + EInvoice từ DB.
   *   2. Tạo nodemailer transport.
   *   3. Gửi mail với HTML content trong body + file đính kèm.
   *   4. Cập nhật status → SENT hoặc FAILED.
   *
   * @param logId - ID của NotificationLog.
   * @returns MailDeliveryResult
   */
  async send(logId: string): Promise<MailDeliveryResult> {
    const start = Date.now();

    // Lấy NotificationLog
    const log = await this.prisma.notificationLog.findUnique({ where: { id: logId } });
    if (!log) {
      return { success: false, error: `NotificationLog ${logId} not found`, durationMs: Date.now() - start };
    }
    if (log.status === 'SENT') {
      return { success: true, messageId: log.providerMessageId ?? 'already_sent', durationMs: 0 };
    }

    const metadata = (log.metadata ?? {}) as Record<string, any>;
    const eInvoiceId = metadata.eInvoiceId as string | undefined;
    const invoiceNumber = metadata.invoiceNumber as string | undefined;

    // Lấy nội dung HTML từ EInvoice
    let htmlContent = '';
    if (eInvoiceId) {
      const eInvoice = await this.prisma.eInvoice.findUnique({ where: { id: eInvoiceId } });
      if (eInvoice) {
        htmlContent = eInvoice.htmlContent;
      }
    }

    // Tạo transport
    const transport = createSmtpTransport();
    if (!transport) {
      // SMTP chưa cấu hình → chỉ log + đánh dấu SENT (không retry)
      const msg = 'SMTP chưa cấu hình, đánh dấu mail là SENT (log only)';
      this.logger.warn(`[${logId}] ${msg}`);
      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: {
          status: 'SENT',
          provider: 'log',
          providerMessageId: `log_${Date.now()}`,
          renderedBody: htmlContent || '(no content)',
          durationMs: Date.now() - start,
        },
      });
      return { success: true, messageId: `log_${Date.now()}`, durationMs: Date.now() - start };
    }

    try {
      // Chuẩn bị mail options
      const subject = log.subject ?? DEFAULT_SUBJECT;
      const filename = invoiceNumber
        ? `HD-${invoiceNumber}.html`
        : `invoice-${eInvoiceId ?? 'unknown'}.html`;

      const attachments: nodemailer.Attachment[] = htmlContent
        ? [generateAttachment(htmlContent, filename)]
        : [];

      // Nếu không có HTML content, dùng body từ log
      const htmlBody = htmlContent || (log.renderedBody ?? '<p>Hóa đơn điện tử AIFUT</p>');

      const mailOptions: nodemailer.SendMailOptions = {
        from: DEFAULT_FROM,
        to: log.to,
        subject,
        html: htmlBody,
        attachments,
      };

      const info = await transport.sendMail(mailOptions);

      // Cập nhật thành công
      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: {
          status: 'SENT',
          provider: 'smtp',
          providerMessageId: info.messageId,
          renderedBody: htmlBody,
          durationMs: Date.now() - start,
          error: null,
        },
      });

      this.logger.log(`Invoice mail sent: ${logId} → ${log.to} (msgId=${info.messageId})`);
      return { success: true, messageId: info.messageId, durationMs: Date.now() - start };
    } catch (err: any) {
      const errMsg = err.message ?? 'Unknown SMTP error';
      this.logger.error(`Invoice mail FAILED: ${logId} → ${log.to}: ${errMsg}`);

      // Tính retry count
      const retryCount = (metadata.retryCount as number) ?? 0;
      const maxRetries = (metadata.maxRetries as number) ?? 3;

      if (retryCount >= maxRetries) {
        // Đã hết retry → đánh dấu FAILED vĩnh viễn
        await this.prisma.notificationLog.update({
          where: { id: logId },
          data: {
            status: 'FAILED',
            error: errMsg,
            durationMs: Date.now() - start,
            metadata: { ...metadata, retryCount: retryCount + 1, lastError: errMsg, nextRetryAt: null },
          },
        });
        this.logger.warn(`Invoice mail job ${logId} exceeded maxRetries (${maxRetries}), marked FAILED`);
      } else {
        // Lên lịch retry với exponential backoff
        const backoffMs = this.computeBackoff(retryCount + 1);
        const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

        await this.prisma.notificationLog.update({
          where: { id: logId },
          data: {
            // Giữ nguyên PENDING (sẽ được poller quét lại sau)
            error: errMsg,
            durationMs: Date.now() - start,
            metadata: {
              ...metadata,
              retryCount: retryCount + 1,
              lastError: errMsg,
              nextRetryAt,
            },
          },
        });
        this.logger.log(`Invoice mail job ${logId} scheduled retry #${retryCount + 1} at ${nextRetryAt}`);
      }

      return { success: false, error: errMsg, durationMs: Date.now() - start };
    }
  }

  // ── 3. Retry Backoff ────────────────────────────────────────────────────

  /**
   * Exponential backoff:
   *   Lần 1 (retryCount=1) → 30 giây
   *   Lần 2 (retryCount=2) → 5 phút
   *   Lần 3 (retryCount=3) → 30 phút
   *
   * Lần 4+ sẽ dùng 30 phút (không tăng thêm) cho đến khi vượt maxRetries.
   */
  private computeBackoff(attempt: number): number {
    const base = 30_000; // 30s
    const factor = 10;   // ×10 cho lần 2, ×60 cho lần 3
    const cap = 30 * 60 * 1000; // 30 phút
    const ms = base * Math.pow(factor, attempt - 1);
    return Math.min(ms, cap);
  }
}
