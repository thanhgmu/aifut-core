/**
 * PDF Template Service — E-Invoice
 * ==================================
 * Compile và render template Handlebars cho hóa đơn điện tử Việt Nam.
 * Hỗ trợ song ngữ, QR data embedding, và HMAC-SHA256 tra cứu.
 */

import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import Handlebars from 'handlebars';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceSellerInfo {
  name: string;
  taxCode: string;
  address: string;
  phone: string;
  email: string;
  bankName?: string;
  bankAccount?: string;
  bankBranch?: string;
}

export interface InvoiceBuyerInfo {
  name: string;
  taxCode: string;
  address: string;
  phone: string;
  email: string;
  buyerCode?: string;
}

export interface InvoiceLineItem {
  name: string;
  description?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceVatBreakdownEntry {
  rate: number;
  netAmount: number;
  vatAmount: number;
}

export interface InvoiceTotals {
  net: number;
  totalVat: number;
  gross: number;
  vatBreakdown: InvoiceVatBreakdownEntry[];
  amountInWords: string;
}

export interface InvoiceFooter {
  preparer: string;
}

export interface InvoiceTemplateData {
  // Seller / Buyer
  seller: InvoiceSellerInfo;
  buyer: InvoiceBuyerInfo;

  // Invoice metadata
  invoiceId: string;
  invoiceNumber: string;
  serialSymbol: string;
  formCode: string;
  issueDate: string;
  createdAt: string;

  // Line items & totals
  items: InvoiceLineItem[];
  totals: InvoiceTotals;

  // Security
  hmacCode: string;
  transactionRef: string;
  fkey?: string;

  // Verification
  verificationUrl: string;

  // Attribution
  footer: InvoiceFooter;

  // Flags
  isElectronic?: boolean;
  watermark?: string;

  // QR data (base64 data URL, injected by generator)
  qrDataUrl?: string;
}

export interface RenderedInvoice {
  html: string;
  hmacCode: string;
  templateData: InvoiceTemplateData;
}

// ---------------------------------------------------------------------------
// Handlebars Helpers
// ---------------------------------------------------------------------------

function registerHelpers(): void {
  if ((Handlebars.helpers as any).formatNumber) return; // already registered

  /** Format number with locale-aware grouping and fixed decimals. */
  Handlebars.registerHelper('formatNumber', (value: number, decimals: number = 2) => {
    if (value == null || isNaN(value)) return '0.00';
    return value.toLocaleString('vi-VN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  });

  /** Increment helper (1-based index for STT). */
  Handlebars.registerHelper('inc', (index: number) => {
    return (index ?? 0) + 1;
  });
}

// ---------------------------------------------------------------------------
// HMAC — Mã tra cứu hóa đơn
// ---------------------------------------------------------------------------

/**
 * Tạo HMAC-SHA256 từ chuỗi dữ liệu hóa đơn.
 *
 * Chuẩn: HMAC(tid || invoiceId || amount || issueDate, secret)
 * Dùng để tạo mã tra cứu chống giả mạo hóa đơn.
 *
 * @param secret - Khóa bí mật (lưu như env INVOICE_HMAC_SECRET).
 * @param data   - Mảng các trường dữ liệu cần ký.
 */
export function computeInvoiceHmac(secret: string, ...data: string[]): string {
  const payload = data.join('||');
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex').toUpperCase();
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PdfTemplateService {
  private readonly logger = new Logger(PdfTemplateService.name);
  private compiledTemplate: HandlebarsTemplateDelegate<InvoiceTemplateData> | null = null;

  /** Đường dẫn tới file template .hbs. */
  private readonly templatePath: string;

  /**
   * @param templateDir - Đường dẫn thư mục chứa templates (mặc định: cùng thư mục ./templates).
   */
  constructor(templateDir?: string) {
    registerHelpers();

    const dir = templateDir ?? resolve(__dirname, 'templates');
    this.templatePath = resolve(dir, 'invoice.hbs');

    this.logger.log(`PdfTemplateService init — template path: ${this.templatePath}`);
  }

  /** Load và compile template Handlebars. */
  private loadTemplate(): void {
    if (this.compiledTemplate) return;

    if (!existsSync(this.templatePath)) {
      throw new Error(`Invoice template not found at: ${this.templatePath}`);
    }

    const source = readFileSync(this.templatePath, 'utf-8');
    this.compiledTemplate = Handlebars.compile<InvoiceTemplateData>(source);
    this.logger.log(`Template compiled successfully (${source.length} bytes)`);
  }

  /**
   * Render hóa đơn ra HTML với đầy đủ dữ liệu.
   *
   * @param data   - Dữ liệu hóa đơn đã đầy đủ (bao gồm hmacCode).
   * @returns      - Object chứa HTML đã render + HMAC code.
   */
  renderInvoice(data: InvoiceTemplateData): RenderedInvoice {
    this.loadTemplate();

    const html = (this.compiledTemplate as any)(data);

    return {
      html,
      hmacCode: data.hmacCode,
      templateData: data,
    };
  }

  /**
   * Tạo mã tra cứu HMAC-SHA256 cho một hóa đơn.
   *
   * @param secret     - Khóa HMAC bí mật.
   * @param invoiceId  - ID hóa đơn (UUID).
   * @param amount     - Tổng tiền (gross).
   * @param issueDate  - Ngày lập hóa đơn (YYYY-MM-DD).
   * @param extra      - Các trường bổ sung (optional).
   */
  generateHmacCode(
    secret: string,
    invoiceId: string,
    amount: number,
    issueDate: string,
    ...extra: string[]
  ): string {
    return computeInvoiceHmac(secret, invoiceId, issueDate, amount.toFixed(2), ...extra);
  }
}
