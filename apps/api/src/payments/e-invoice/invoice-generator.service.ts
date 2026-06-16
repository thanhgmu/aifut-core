/**
 * Invoice Generator Service — E-Invoice
 * =======================================
 * Service chịu trách nhiệm:
 *   - Sinh mã số hóa đơn qua bộ đếm atomic (dùng SQL sequence hoặc Redis INCR).
 *   - Đảm bảo tính idempotent theo invoiceId (chống trùng lặp).
 *   - Phối hợp VAT calculator + PDF template để tạo hóa đơn đầu ra.
 *
 * Tuân thủ Nghị định 123/2020/ND-CP và Thông tư 78/2021/TT-BTC.
 */

import { Injectable, Logger, ConflictException, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  PdfTemplateService,
  InvoiceTemplateData,
  InvoiceSellerInfo,
  InvoiceBuyerInfo,
  InvoiceLineItem,
  InvoiceTotals,
  InvoiceVatBreakdownEntry,
} from './pdf-template.service';
import { splitVat, numberToVietnameseWords, formatInvoiceAmount } from './vat-calculator.util';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceGenerationInput {
  /** ID hóa đơn duy nhất (UUID v4). Dùng để idempotent check. */
  invoiceId: string;

  /** Tenant ID (khách hàng đang sử dụng hệ thống). */
  tenantId: string;

  /** Account ID (người tạo hóa đơn). */
  accountId: string;

  /** Thông tin người bán. */
  seller: InvoiceSellerInfo;

  /** Thông tin người mua. */
  buyer: InvoiceBuyerInfo;

  /** Danh sách hàng hóa / dịch vụ. */
  items: InvoiceLineItem[];

  /** Ký hiệu hóa đơn (VD: 1K24TAA). */
  serialSymbol: string;

  /** Mẫu số hóa đơn (VD: 01GTKT0/001). */
  formCode: string;

  /** Ngày lập hóa đơn (YYYY-MM-DD). */
  issueDate: string;

  /** URL xác thực hóa đơn. */
  verificationUrl: string;

  /** Người lập hóa đơn. */
  preparer: string;

  /** Ref giao dịch (từ payment gateway). */
  transactionRef?: string;

  /** Ghi chú thêm. */
  notes?: string;

  /** Watermark text. */
  watermark?: string;
}

export interface InvoiceGenerationOutput {
  /** ID hóa đơn (đã được xác nhận idempotent). */
  invoiceId: string;

  /** Số hóa đơn (tự động sinh, VD: 00000123). */
  invoiceNumber: string;

  /** Ký hiệu + số hóa đơn đầy đủ. */
  fullNumber: string;

  /** Nội dung hóa đơn HTML (đã render từ template). */
  html: string;

  /** Mã tra cứu HMAC-SHA256. */
  hmacCode: string;

  /** Tổng hợp số liệu tài chính. */
  financialSummary: {
    net: number;
    totalVat: number;
    gross: number;
    vatBreakdown: InvoiceVatBreakdownEntry[];
    amountInWords: string;
  };

  /** Thời điểm tạo. */
  createdAt: string;

  /** Có phải lần tạo lại (re-generation) hay không. */
  isRetry: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class InvoiceGeneratorService {
  private readonly logger = new Logger(InvoiceGeneratorService.name);

  /** Khóa bí mật HMAC (lấy từ env hoặc inject). */
  private readonly hmacSecret: string;

  /** Prefix của số hóa đơn (VD: INV). */
  private readonly invoicePrefix: string;

  /** Số chữ số tối thiểu cho số hóa đơn (padding '0' bên trái). */
  private readonly invoiceNumberPadding: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateService: PdfTemplateService,
    @Inject('INVOICE_HMAC_SECRET') hmacSecret: string,
    @Inject('INVOICE_PREFIX') invoicePrefix: string = 'INV',
    @Inject('INVOICE_NUMBER_PADDING') invoiceNumberPadding: number = 8,
  ) {
    this.hmacSecret = hmacSecret;
    this.invoicePrefix = invoicePrefix;
    this.invoiceNumberPadding = invoiceNumberPadding;
  }

  // -----------------------------------------------------------------------
  // 1. Atomic counter — sinh số hóa đơn
  // -----------------------------------------------------------------------

  /**
   * Sinh số hóa đơn tiếp theo dùng SQL sequence (atomic, transaction-safe).
   *
   * Phương án: tạo/prisma sequence table với PostgreSQL SERIAL / sequence.
   * Nếu chưa có row cho tenant + serial, tự động tạo mới từ 1.
   */
  private async generateInvoiceNumber(tenantId: string, serialSymbol: string): Promise<string> {
    // Atomic UPSERT: tăng counter trong cùng transaction
    const [result] = await this.prisma.$queryRawUnsafe<Array<{ next_val: bigint }>>(
      `INSERT INTO "InvoiceCounter" (tenant_id, serial_symbol, counter, updated_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (tenant_id, serial_symbol)
       DO UPDATE SET counter = "InvoiceCounter".counter + 1, updated_at = NOW()
       RETURNING counter AS next_val`,
      tenantId,
      serialSymbol,
    );

    const rawVal = Number(result.next_val);

    // Ghép prefix + serial + số thứ tự
    const seqNum = String(rawVal).padStart(this.invoiceNumberPadding, '0');
    return `${this.invoicePrefix}${serialSymbol}${seqNum}`;
  }

  // -----------------------------------------------------------------------
  // 2. Idempotent check
  // -----------------------------------------------------------------------

  /**
   * Kiểm tra idempotent: nếu invoiceId đã tồn tại trong DB, trả về bản ghi cũ.
   * Đảm bảo không tạo trùng hóa đơn cho cùng invoiceId.
   */
  private async checkIdempotent(invoiceId: string): Promise<InvoiceGenerationOutput | null> {
    const existing = await this.prisma.eInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!existing) return null;

    this.logger.warn(`Idempotent hit — invoice ${invoiceId} already exists, returning cached`);

    return {
      invoiceId: existing.id,
      invoiceNumber: existing.invoiceNumber,
      fullNumber: existing.fullNumber,
      html: existing.htmlContent,
      hmacCode: existing.hmacCode,
      financialSummary: existing.financialSummary as unknown as InvoiceGenerationOutput['financialSummary'],
      createdAt: existing.createdAt.toISOString(),
      isRetry: true,
    };
  }

  // -----------------------------------------------------------------------
  // 3. Tính toán tài chính
  // -----------------------------------------------------------------------

  /**
   * Tính toán tổng tiền, phân bổ VAT theo từng mức thuế suất,
   * và sinh chữ số tiền bằng tiếng Việt.
   */
  private computeFinancials(items: InvoiceLineItem[]): {
    net: number;
    totalVat: number;
    gross: number;
    vatBreakdown: InvoiceVatBreakdownEntry[];
    amountInWords: string;
  } {
    // Gom các item theo thuế suất (mặc định 10% nếu không có rate)
    // Ở mức này chúng ta đơn giản hóa: tất cả items dùng chung 1 thuế suất 10%.
    // Có thể mở rộng thành per-item VAT rate nếu cần.
    const totalNet = items.reduce((sum, item) => sum + item.amount, 0);
    const split = splitVat(totalNet * (1 + 10 / 100), 10);

    const entry: InvoiceVatBreakdownEntry = {
      rate: 10,
      netAmount: split.net,
      vatAmount: split.vat,
    };

    const words = numberToVietnameseWords(split.gross);

    return {
      net: split.net,
      totalVat: split.vat,
      gross: split.gross,
      vatBreakdown: [entry],
      amountInWords: words,
    };
  }

  // -----------------------------------------------------------------------
  // 4. Sinh mã tra cứu HMAC
  // -----------------------------------------------------------------------

  /** Tạo HMAC-SHA256 từ các trường cốt lõi của hóa đơn. */
  private buildHmacCode(
    invoiceId: string,
    invoiceNumber: string,
    gross: number,
    issueDate: string,
  ): string {
    return this.templateService.generateHmacCode(
      this.hmacSecret,
      invoiceId,
      gross,
      issueDate,
      invoiceNumber,
    );
  }

  // -----------------------------------------------------------------------
  // 5. Build template data → HTML
  // -----------------------------------------------------------------------

  /**
   * Tạo dữ liệu đầy đủ cho template và render ra HTML.
   */
  private buildTemplateData(
    invoiceId: string,
    invoiceNumber: string,
    input: InvoiceGenerationInput,
    financials: InvoiceTotals,
    hmacCode: string,
  ): InvoiceTemplateData {
    return {
      seller: input.seller,
      buyer: input.buyer,
      invoiceId,
      invoiceNumber,
      serialSymbol: input.serialSymbol,
      formCode: input.formCode,
      issueDate: input.issueDate,
      createdAt: new Date().toISOString(),
      items: input.items,
      totals: financials,
      hmacCode,
      transactionRef: input.transactionRef ?? `TXN-${invoiceId.slice(0, 8)}`,
      fkey: `${input.serialSymbol}-${invoiceNumber}`,
      verificationUrl: input.verificationUrl,
      footer: { preparer: input.preparer },
      isElectronic: true,
      watermark: input.watermark,
    };
  }

  // -----------------------------------------------------------------------
  // 6. Persist hóa đơn vào DB
  // -----------------------------------------------------------------------

  /** Lưu bản ghi eInvoice vào database. */
  private async persistInvoice(
    invoiceId: string,
    invoiceNumber: string,
    fullNumber: string,
    input: InvoiceGenerationInput,
    html: string,
    hmacCode: string,
    financialSummary: InvoiceGenerationOutput['financialSummary'],
  ): Promise<void> {
    await this.prisma.eInvoice.create({
      data: {
        id: invoiceId,
        tenantId: input.tenantId,
        accountId: input.accountId,
        invoiceNumber,
        serialSymbol: input.serialSymbol,
        formCode: input.formCode,
        fullNumber,
        issueDate: new Date(input.issueDate),
        sellerInfo: input.seller as any,
        buyerInfo: input.buyer as any,
        items: input.items as any,
        financialSummary: financialSummary as any,
        htmlContent: html,
        hmacCode,
        transactionRef: input.transactionRef,
        notes: input.notes,
        status: 'issued',
      },
    });
  }

  // -----------------------------------------------------------------------
  // 7. Public API — generate
  // -----------------------------------------------------------------------

  /**
   * Tạo hóa đơn điện tử đầy đủ.
   *
   * Quy trình:
   *   1. Idempotent check — nếu invoiceId đã tồn tại, trả về bản ghi cũ (ConflictException nếu conflict=false).
   *   2. Atomic counter — sinh số hóa đơn duy nhất.
   *   3. Tính toán tài chính — net, vat, gross, chữ.
   *   4. Tạo mã tra cứu HMAC-SHA256.
   *   5. Render HTML từ template Handlebars.
   *   6. Persist vào DB.
   *   7. Return kết quả.
   *
   * @param input - Dữ liệu đầu vào.
   * @param conflict - Nếu true, trả về bản ghi cũ thay vì ném ConflictException (mặc định: false).
   */
  async generate(input: InvoiceGenerationInput, conflict: boolean = false): Promise<InvoiceGenerationOutput> {
    // Bước 1: Idempotent
    const existing = await this.checkIdempotent(input.invoiceId);
    if (existing) {
      if (!conflict) {
        throw new ConflictException(`Invoice ${input.invoiceId} already exists`);
      }
      return existing;
    }

    // Bước 2: Sinh số hóa đơn (atomic)
    const invoiceNumber = await this.generateInvoiceNumber(input.tenantId, input.serialSymbol);
    const fullNumber = `${input.serialSymbol}-${invoiceNumber}`;

    this.logger.log(`Generating invoice: ${fullNumber} (id=${input.invoiceId})`);

    // Bước 3: Tính toán tài chính
    const financials = this.computeFinancials(input.items);
    const gross = financials.gross;

    // Bước 4: HMAC
    const hmacCode = this.buildHmacCode(input.invoiceId, invoiceNumber, gross, input.issueDate);

    // Bước 5: Render HTML
    const templateData = this.buildTemplateData(
      input.invoiceId,
      invoiceNumber,
      input,
      financials,
      hmacCode,
    );
    const { html } = this.templateService.renderInvoice(templateData);

    // Bước 6: Persist
    await this.persistInvoice(
      input.invoiceId,
      invoiceNumber,
      fullNumber,
      input,
      html,
      hmacCode,
      financials,
    );

    this.logger.log(`Invoice ${fullNumber} persisted successfully`);

    // Bước 7: Output
    return {
      invoiceId: input.invoiceId,
      invoiceNumber,
      fullNumber,
      html,
      hmacCode,
      financialSummary: financials,
      createdAt: new Date().toISOString(),
      isRetry: false,
    };
  }
}
