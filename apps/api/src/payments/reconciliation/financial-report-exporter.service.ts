// ============================================================
// financial-report-exporter.service.ts — Async Report Export
// ============================================================
// Sinh báo cáo tài chính phi đồng bộ, hỗ trợ:
//   - CSV output (streaming để tránh OOM với dữ liệu lớn)
//   - Phân trang lớn (cursor-based fetch, stream từng chunk)
//   - File tạm thời với expiration (24h)
//
// Flow:
//   POST /billing/reconciliation/export
//   → Tạo FinancialReportJob (status=pending)
//   → Trả về { jobId, status: 'pending' }
//   → Xử lý background (process.nextTick)
//   → Poll GET /billing/reconciliation/export/:jobId/status
//   → Khi completed: GET /billing/reconciliation/export/:jobId/download
//
// Dữ liệu báo cáo:
//   1. Header: tenant info, khoảng thời gian, thời điểm xuất
//   2. Ledger transactions trong kỳ (CREDIT và DEBIT)
//   3. Invoice trong kỳ (từng hóa đơn + trạng thái)
//   4. Payment transactions trong kỳ
//   5. Reconciliation runs gần nhất (tối đa 30)
//   6. Outstanding discrepancies
//   7. Summary: tổng thu, tổng chi, lệch pha
//
// Export chunks (theo EXPORT_CHUNK_SIZE từ config):
//   - LedgerTransaction: 1000 records/lần
//   - Invoice: 500 records/lần
//   - PaymentTransaction: 500 records/lần
//   - DiscrepancyRecord: 200 records/lần
// ============================================================

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  EXPORT_CHUNK_SIZE,
  RECONCILIATION_LIMITS,
} from './reconciliation.config';
import type {
  ExportProgress,
  ReportExportOptions,
} from './reconciliation.types';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable, PassThrough } from 'node:stream';

/**
 * Đường dẫn lưu file export tạm thời.
 * Dùng tempDir của OS để tránh rò rỉ disk.
 */
const EXPORT_DIR = path.resolve(
  process.env.TEMP || process.env.TMPDIR || '/tmp',
  'aifut-reconciliation-export',
);

@Injectable()
export class FinancialReportExporterService {
  private readonly logger = new Logger(FinancialReportExporterService.name);

  constructor(private readonly prisma: PrismaService) {
    // Đảm bảo thư mục export tồn tại
    if (!fs.existsSync(EXPORT_DIR)) {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  /**
   * requestReport
   * ==============
   * Tạo job xuất báo cáo mới.
   * Kiểm tra trùng lặp: nếu có job completed gần đây → trả về job cũ.
   * Nếu có job pending → trả về job đang chạy.
   * Nếu không → tạo mới + xử lý background.
   */
  async requestReport(
    options: ReportExportOptions,
  ): Promise<{ jobId: string; status: string; createdAt: string }> {
    // ── Kiểm tra job completed gần đây (cùng tenant + kỳ + format) ──
    const recentJob = await this.prisma.financialReportJob.findFirst({
      where: {
        tenantId: options.tenantId,
        reportType: options.reportType,
        format: options.format,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        status: { in: ['COMPLETED'] },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentJob) {
      return {
        jobId: recentJob.id,
        status: recentJob.status,
        createdAt: recentJob.createdAt.toISOString(),
      };
    }

    // ── Kiểm tra job pending ──
    const pendingJob = await this.prisma.financialReportJob.findFirst({
      where: {
        tenantId: options.tenantId,
        reportType: options.reportType,
        format: options.format,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    if (pendingJob) {
      return {
        jobId: pendingJob.id,
        status: pendingJob.status,
        createdAt: pendingJob.createdAt.toISOString(),
      };
    }

    // ── Tạo job mới ──
    const job = await this.prisma.financialReportJob.create({
      data: {
        tenantId: options.tenantId,
        requestedBy: options.requestedBy,
        reportType: options.reportType,
        format: options.format,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        includeDetails: options.includeDetails,
        status: 'PENDING',
        expiresAt: new Date(
          Date.now() + RECONCILIATION_LIMITS.exportFileTtlHours * 60 * 60 * 1000,
        ),
      },
    });

    // ── Xử lý background ──
    // Dùng queue giả: process.nextTick để không block request
    process.nextTick(() => {
      this.processJob(job.id).catch((err) => {
        this.logger.error(
          `[requestReport] processJob ${job.id} failed: ${String(err)}`,
        );
      });
    });

    return {
      jobId: job.id,
      status: 'pending',
      createdAt: job.createdAt.toISOString(),
    };
  }

  /**
   * getJobStatus
   * =============
   * Kiểm tra tiến độ export.
   */
  async getJobStatus(jobId: string): Promise<ExportProgress> {
    const job = await this.prisma.financialReportJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Export job not found: ${jobId}`);
    }

    return {
      jobId: job.id,
      status: job.status as ExportProgress['status'],
      progress: job.status === 'COMPLETED' ? 100 : job.status === 'PROCESSING' ? 50 : 0,
      fileUrl:
        job.status === 'COMPLETED' && job.filePath
          ? `/billing/reconciliation/export/${job.id}/download`
          : null,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
    };
  }

  /**
   * getDownloadStream
   * ==================
   * Trả về ReadableStream của file báo cáo đã hoàn thành.
   * Stream trực tiếp từ disk, không load toàn bộ vào memory.
   */
  async getDownloadStream(jobId: string): Promise<{
    stream: NodeJS.ReadableStream;
    filename: string;
    contentType: string;
    contentLength: number;
  }> {
    const job = await this.prisma.financialReportJob.findUnique({
      where: { id: jobId },
    });

    if (!job || job.status !== 'COMPLETED') {
      throw new NotFoundException(
        `Export job not found or not yet completed: ${jobId}`,
      );
    }

    if (!job.filePath || !fs.existsSync(job.filePath)) {
      throw new NotFoundException(
        `Export file not found on disk: ${job.filePath}`,
      );
    }

    const stat = fs.statSync(job.filePath);
    const extension = job.format === 'csv' ? 'csv' : 'xlsx';
    const filename = `financial-report_${job.reportType}_${this.formatDate(job.dateFrom)}-${this.formatDate(job.dateTo)}.${extension}`;

    return {
      stream: fs.createReadStream(job.filePath),
      filename,
      contentType: job.format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentLength: stat.size,
    };
  }

  /**
   * processJob
   * ===========
   * Xử lý job trong background.
   * Fetch data với cursor-based pagination, stream ghi file CSV.
   */
  async processJob(jobId: string): Promise<void> {
    const job = await this.prisma.financialReportJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      this.logger.error(`[processJob] Job not found: ${jobId}`);
      return;
    }

    // ── Đánh dấu processing ──
    await this.prisma.financialReportJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING' },
    });

    const filePath = path.join(EXPORT_DIR, `${jobId}.csv`);

    try {
      // ── Build CSV stream ──
      const csvStream = await this.buildCsvStream(
        jobId,
        job.tenantId,
        job.dateFrom,
        job.dateTo,
        job.includeDetails,
      );

      // ── Pipe ra file ──
      await this.pipeToFile(csvStream, filePath);

      const fileSize = fs.statSync(filePath).size;

      // ── Cập nhật job completed ──
      await this.prisma.financialReportJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          filePath,
          fileSize,
          completedAt: new Date(),
        },
      });

      this.logger.log(
        `[processJob] completed: ${jobId} (${fileSize} bytes → ${filePath})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Cleanup file lỗi nếu có
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      await this.prisma.financialReportJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error: message },
      });

      this.logger.error(`[processJob] failed: ${jobId} — ${message}`);
    }
  }

  /**
   * cleanupExpiredFiles
   * ====================
   * Xóa file tạm quá 24h và set job status='expired'.
   * Chạy mỗi 1 giờ từ ReportSchedulerService.
   */
  async cleanupExpiredFiles(): Promise<number> {
    const cutoff = new Date(
      Date.now() - RECONCILIATION_LIMITS.exportFileTtlHours * 60 * 60 * 1000,
    );

    const expiredJobs = await this.prisma.financialReportJob.findMany({
      where: {
        status: 'COMPLETED',
        createdAt: { lte: cutoff },
      },
      select: { id: true, filePath: true },
    });

    let cleaned = 0;
    for (const job of expiredJobs) {
      if (job.filePath && fs.existsSync(job.filePath)) {
        try {
          fs.unlinkSync(job.filePath);
          cleaned++;
        } catch (err) {
          this.logger.warn(
            `[cleanupExpiredFiles] cannot delete ${job.filePath}: ${String(err)}`,
          );
        }
      }

      await this.prisma.financialReportJob.update({
        where: { id: job.id },
        data: { status: 'EXPIRED', filePath: null, fileSize: null },
      });
    }

    if (cleaned > 0) {
      this.logger.log(
        `[cleanupExpiredFiles] cleaned ${cleaned} expired export files`,
      );
    }

    return cleaned;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PRIVATE BUILDERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * buildCsvStream
   * ===============
   * Xây dựng ReadableStream CSV từ Prisma data.
   * Mỗi section là function riêng, trả về buffer string.
   * Streaming: pipe từng chunk intermediate qua PassThrough.
   */
  private async buildCsvStream(
    jobId: string,
    tenantId: string,
    dateFrom: Date,
    dateTo: Date,
    includeDetails: boolean,
  ): Promise<NodeJS.ReadableStream> {
    // ── Lấy tenant info ──
    let tenantName = tenantId;
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });
      if (tenant?.name) tenantName = tenant.name;
    } catch {
      // Tenant model chưa có hoặc lỗi — dùng fallback
    }

    const passThrough = new PassThrough();

    // Chạy async để stream data
    this.writeCsvContent(
      passThrough,
      tenantId,
      tenantName,
      dateFrom,
      dateTo,
      includeDetails,
    ).catch((err) => {
      passThrough.destroy(err);
    });

    return passThrough;
  }

  /**
   * writeCsvContent
   * ================
   * Ghi tuần tự các section vào writable stream.
   * Mỗi section fetch data với cursor pagination (chunk size từ config)
   * và write từng chunk ngay lập tức để tránh OOM.
   */
  private async writeCsvContent(
    writable: PassThrough,
    tenantId: string,
    tenantName: string,
    dateFrom: Date,
    dateTo: Date,
    includeDetails: boolean,
  ): Promise<void> {
    const nl = '\n';

    // ── Section 1: Summary ──
    writable.write(`# Financial Report — ${tenantName}${nl}`);
    writable.write(`# Period,${this.formatDate(dateFrom)},${this.formatDate(dateTo)}${nl}`);
    writable.write(`# Generated,${new Date().toISOString()}${nl}`);
    writable.write(`# Tenant ID,${tenantId}${nl}`);
    writable.write(nl);

    // Tính summary
    const summary = await this.buildSummary(tenantId, dateFrom, dateTo);
    writable.write('Section,Key,Value');
    writable.write(nl);
    for (const [key, value] of Object.entries(summary)) {
      this.writeCsvRow(writable, ['Summary', key, String(value)]);
    }
    writable.write(nl);

    // ── Section 2: Ledger Transactions ──
    writable.write('Section,ID,Type,Amount,BalanceAfter,ReferenceType,ReferenceID,Description,CreatedAt');
    writable.write(nl);

    let cursor: any = undefined;
    let ledgerCount = 0;
    do {
      const batch = await (this.prisma as any).ledgerTransaction.findMany({
        take: EXPORT_CHUNK_SIZE.ledgerTransaction,
        skip: cursor ? 1 : 0,
        ...(cursor ? { cursor: { id: cursor } } : {}),
        where: {
          tenantId,
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        orderBy: { createdAt: 'asc' },
      });

      for (const tx of batch) {
        this.writeCsvRow(writable, [
          'LedgerTransaction',
          tx.id,
          tx.type,
          tx.amount.toString(),
          tx.balanceAfter?.toString() ?? '',
          tx.referenceType ?? '',
          tx.referenceId ?? '',
          this.escapeCsv(tx.description ?? ''),
          tx.createdAt.toISOString(),
        ]);
        ledgerCount++;
      }

      cursor = batch.length === EXPORT_CHUNK_SIZE.ledgerTransaction
        ? batch[batch.length - 1].id
        : undefined;
    } while (cursor);

    writable.write(nl);

    if (!includeDetails) {
      // Nếu không include detail thì chỉ xuất summary
      writable.write(`# Report complete — ${ledgerCount} ledger transactions${nl}`);
      writable.end();
      return;
    }

    // ── Section 3: Invoices ──
    writable.write('Section,ID,Amount,Status,Currency,Description,CreatedAt');
    writable.write(nl);

    cursor = undefined;
    let invoiceCount = 0;
    do {
      const batch = await (this.prisma as any).invoice.findMany({
        take: EXPORT_CHUNK_SIZE.invoice,
        skip: cursor ? 1 : 0,
        ...(cursor ? { cursor: { id: cursor } } : {}),
        where: {
          tenantId,
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        orderBy: { createdAt: 'asc' },
      });

      for (const inv of batch) {
        this.writeCsvRow(writable, [
          'Invoice',
          inv.id,
          (inv.amount ?? 0).toString(),
          inv.status ?? '',
          inv.currency ?? '',
          this.escapeCsv(inv.description ?? ''),
          inv.createdAt.toISOString(),
        ]);
        invoiceCount++;
      }

      cursor = batch.length === EXPORT_CHUNK_SIZE.invoice
        ? batch[batch.length - 1].id
        : undefined;
    } while (cursor);

    writable.write(nl);

    // ── Section 4: Payment Transactions ──
    writable.write('Section,ID,Gateway,Amount,Status,Currency,ReferenceID,CreatedAt');
    writable.write(nl);

    cursor = undefined;
    let paymentCount = 0;
    do {
      const batch = await (this.prisma as any).paymentTransaction.findMany({
        take: EXPORT_CHUNK_SIZE.paymentTransaction,
        skip: cursor ? 1 : 0,
        ...(cursor ? { cursor: { id: cursor } } : {}),
        where: {
          tenantId,
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        orderBy: { createdAt: 'asc' },
      });

      for (const pt of batch) {
        this.writeCsvRow(writable, [
          'PaymentTransaction',
          pt.id,
          pt.gateway ?? '',
          (pt.amount ?? 0).toString(),
          pt.status ?? '',
          pt.currency ?? '',
          pt.referenceId ?? '',
          pt.createdAt.toISOString(),
        ]);
        paymentCount++;
      }

      cursor = batch.length === EXPORT_CHUNK_SIZE.paymentTransaction
        ? batch[batch.length - 1].id
        : undefined;
    } while (cursor);

    writable.write(nl);

    // ── Section 5: Reconciliation Runs ──
    writable.write('Section,RunID,Trigger,Status,StartedAt,CompletedAt,DiscrepancyCount');
    writable.write(nl);

    const recentRuns = await (this.prisma as any).reconciliationRun.findMany({
      where: { tenantId },
      orderBy: { startedAt: 'desc' },
      take: 30,
    });

    for (const run of recentRuns) {
      this.writeCsvRow(writable, [
        'ReconciliationRun',
        run.id,
        run.trigger ?? '',
        run.status ?? '',
        run.startedAt.toISOString(),
        run.completedAt?.toISOString() ?? '',
        String(run.discrepancyCount ?? 0),
      ]);
    }

    writable.write(nl);

    // ── Section 6: Outstanding Discrepancies ──
    writable.write('Section,ID,Severity,Category,Title,DiffValue,Status,CreatedAt');
    writable.write(nl);

    cursor = undefined;
    let discrepancyCount = 0;
    do {
      const batch = await (this.prisma as any).discrepancyRecord.findMany({
        take: EXPORT_CHUNK_SIZE.discrepancyRecord,
        skip: cursor ? 1 : 0,
        ...(cursor ? { cursor: { id: cursor } } : {}),
        where: {
          tenantId,
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        orderBy: { createdAt: 'asc' },
      });

      for (const dr of batch) {
        this.writeCsvRow(writable, [
          'DiscrepancyRecord',
          dr.id,
          dr.severity ?? '',
          dr.category ?? '',
          this.escapeCsv(dr.title ?? ''),
          dr.diffValue?.toString() ?? '',
          dr.status ?? '',
          dr.createdAt.toISOString(),
        ]);
        discrepancyCount++;
      }

      cursor = batch.length === EXPORT_CHUNK_SIZE.discrepancyRecord
        ? batch[batch.length - 1].id
        : undefined;
    } while (cursor);

    writable.write(nl);
    writable.write(`# End of report — ${ledgerCount} txns, ${invoiceCount} invoices, ${paymentCount} payments, ${discrepancyCount} discrepancies${nl}`);
    writable.end();
  }

  // ═══════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * buildSummary
   * =============
   * Aggregate numbers cho Section 1 (Summary).
   */
  private async buildSummary(
    tenantId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<Record<string, string | number>> {
    // Tổng CREDIT/DEBIT từ ledger trong kỳ
    const ledgerByType = await (this.prisma as any).ledgerTransaction.groupBy({
      by: ['type'],
      where: {
        tenantId,
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      _sum: { amount: true },
    });

    let creditSum = 0n;
    let debitSum = 0n;
    for (const row of ledgerByType) {
      const sum = row._sum.amount ?? 0n;
      if (row.type === 'CREDIT') creditSum += sum;
      else if (row.type === 'DEBIT') debitSum += sum;
    }

    // Wallet balance hiện tại
    let walletBalance = 'N/A';
    try {
      const wallet = await this.prisma.wallet.findUnique({
        where: { tenantId },
      });
      if (wallet) walletBalance = wallet.balance.toString();
    } catch {
      // Wallet chưa tồn tại
    }

    // Tổng hóa đơn paid trong kỳ
    let paidInvoiceSum = 'N/A';
    try {
      const agg = await this.prisma.invoice.aggregate({
        where: {
          tenantId,
          status: 'paid',
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        _sum: { amount: true },
      });
      paidInvoiceSum = (agg._sum.amount ?? 0).toString();
    } catch {
      // Invoice model chưa có
    }

    // Số discrepancy trong kỳ
    let discrepancyCount = 0;
    try {
      discrepancyCount = await this.prisma.discrepancyRecord.count({
        where: {
          tenantId,
          createdAt: { gte: dateFrom, lte: dateTo },
        },
      });
    } catch {
      // DiscrepancyRecord model chưa có migration
    }

    return {
      'Wallet Balance': walletBalance,
      'Total Credit': creditSum.toString(),
      'Total Debit': debitSum.toString(),
      'Net Ledger Flow': (creditSum - debitSum).toString(),
      'Paid Invoices': paidInvoiceSum,
      'Discrepancy Count': discrepancyCount,
    };
  }

  /**
   * pipeToFile
   * ===========
   * Pipe ReadableStream ra file, trả về Promise khi hoàn tất.
   */
  private pipeToFile(
    stream: NodeJS.ReadableStream,
    filePath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(filePath);
      stream
        .pipe(fileStream)
        .on('finish', resolve)
        .on('error', reject);
    });
  }

  /**
   * writeCsvRow
   * ============
   * Ghi 1 dòng CSV vào writable stream.
   */
  private writeCsvRow(
    writable: PassThrough,
    values: string[],
  ): void {
    writable.write(values.join(',') + '\n');
  }

  /**
   * escapeCsv
   * ==========
   * Escape giá trị CSV: wrap trong double quotes nếu chứa dấu phẩy,
   * xuống dòng, hoặc double quote.
   */
  private escapeCsv(value: string): string {
    if (
      value.includes(',') ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r')
    ) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * formatDate
   * ===========
   * Format Date → YYYY-MM-DD.
   */
  private formatDate(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
