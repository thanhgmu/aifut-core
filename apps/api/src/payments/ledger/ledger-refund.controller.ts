// ============================================================
// ledger-refund.controller.ts — Refund Request Controller
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: API endpoint POST /billing/refund/request tiếp nhận
// yêu cầu hoàn tiền. Anti-IDOR (tenantId lấy từ auth context).
// Flow: validate DTO → kiểm tra tính toàn vẹn (anti-over-refund)
// → processRefundCredit (ghi CREDIT wallet) → trả kết quả.
// ============================================================

import {
  Controller,
  Post,
  Body,
  Req,
  BadRequestException,
  UnauthorizedException,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequestWithContext } from '../../common/middleware/dev-context.middleware';
import { LedgerRefundService } from './ledger-refund.service';
import type { RefundInput, RefundResult } from './ledger-refund.types';

// ================================================================
// DTO (Data Transfer Object) — đầu vào từ client
// ================================================================

/**
 * RefundRequestDto
 * DTO cho endpoint POST /billing/refund/request.
 * tenantId KHÔNG được gửi từ client — lấy từ auth context (chống IDOR).
 */
interface RefundRequestDto {
  /** ID giao dịch gốc cần hoàn tiền (PaymentTransaction.id) */
  originalReferenceId: string;

  /** Số tiền hoàn (đơn vị VND, luôn dương) */
  amount: number;

  /** Lý do hoàn tiền (optional) */
  description?: string;

  /** Metadata bổ sung (optional) */
  metadata?: Record<string, unknown>;
}

// ================================================================
// Response DTO
// ================================================================

/**
 * RefundResponseDto
 * DTO phản hồi cho client. BigInt được chuyển thành string
 * để tránh mất precision khi JSON serialization.
 */
interface RefundResponseDto {
  success: boolean;
  refundRecordId: string;
  transactionId: string;
  amount: string;
  status: string;
  error?: string;
}

/**
 * IntegrityCheckResultDto
 * Kết quả kiểm tra tính toàn vẹn refund (dùng cho pre-check).
 */
interface IntegrityCheckDto {
  pass: boolean;
  originalAmount: string;
  totalRefunded: string;
  requestedAmount: string;
  remainingAvailable: string;
  details: string[];
}

// ================================================================
// Controller
// ================================================================

@Controller('billing/refund')
export class LedgerRefundController {
  private readonly logger = new Logger(LedgerRefundController.name);

  constructor(private readonly refundService: LedgerRefundService) {}

  /**
   * POST /billing/refund/request
   *
   * Tiếp nhận yêu cầu hoàn tiền từ tenant.
   * Anti-IDOR: tenantId lấy từ req.context.tenant.id — KHÔNG từ body.
   *
   * Flow:
   *   1. Extract tenantId từ auth context (chống IDOR)
   *   2. Parse & validate DTO
   *   3. Chuyển amount (number) → BigInt
   *   4. Gọi checkRefundIntegrity() pre-check
   *   5. Gọi processRefundCredit() thực thi
   *   6. Trả RefundResponseDto
   *
   * @param req   - Express Request (có context chứa tenant)
   * @param body  - RefundRequestDto từ client
   * @returns     - RefundResponseDto
   */
  @Post('request')
  @HttpCode(HttpStatus.OK)
  async requestRefund(
    @Req() req: Request,
    @Body() body: RefundRequestDto,
  ): Promise<RefundResponseDto> {
    // ── 1. Anti-IDOR: tenantId từ auth context ────────────────
    const tenantId = this.resolveTenantId(req);

    // ── 2. Validate DTO ────────────────────────────────────────
    const validated = this.validateDto(body);

    // ── 3. Chuyển number → BigInt (đơn vị đồng) ───────────────
    const amount = BigInt(Math.round(validated.amount));
    if (amount <= BigInt(0)) {
      throw new BadRequestException(
        'Số tiền hoàn phải lớn hơn 0.',
      );
    }

    // ── 4. Xây dựng RefundInput ────────────────────────────────
    const refundInput: RefundInput = {
      tenantId,
      originalReferenceId: validated.originalReferenceId,
      amount,
      description: validated.description,
      metadata: validated.metadata,
    };

    this.logger.log(
      `Refund request | tenant=${tenantId} | ` +
        `orig=${refundInput.originalReferenceId} | amount=${amount}`,
    );

    // ── 5. Kiểm tra tính toàn vẹn trước khi thực thi ──────────
    // (anti-over-refund pre-check)
    const integrity = await this.refundService.checkRefundIntegrity(refundInput);
    if (!integrity.pass) {
      this.logger.warn(
        `Refund integrity check FAILED | tenant=${tenantId} | ` +
          `orig=${refundInput.originalReferenceId} | ` +
          `amount=${amount}`,
      );
      throw new BadRequestException({
        message: 'Hoàn tiền không hợp lệ: kiểm tra tính toàn vẹn thất bại.',
        integrity: {
          pass: false,
          originalAmount: integrity.originalAmount.toString(),
          totalRefunded: integrity.totalRefunded.toString(),
          requestedAmount: integrity.requestedAmount.toString(),
          remainingAvailable: integrity.remainingAvailable.toString(),
          details: integrity.details,
        } satisfies IntegrityCheckDto,
      });
    }

    // ── 6. Thực thi hoàn tiền ──────────────────────────────────
    let result: RefundResult;
    try {
      result = await this.refundService.processRefundCredit(refundInput);
    } catch (error: any) {
      this.logger.error(
        `Refund execution FAILED | tenant=${tenantId} | ` +
          `orig=${refundInput.originalReferenceId} | ` +
          `error=${error.message}`,
      );
      throw new BadRequestException({
        message: `Hoàn tiền thất bại: ${error.message}`,
        error: error.message,
      });
    }

    // ── 7. Trả kết quả ────────────────────────────────────────
    this.logger.log(
      `Refund SUCCESS | tenant=${tenantId} | ` +
        `refundRecord=${result.refundRecordId} | ` +
        `tx=${result.transactionId} | amount=${result.amount}`,
    );

    return {
      success: result.success,
      refundRecordId: result.refundRecordId,
      transactionId: result.transactionId,
      amount: result.amount.toString(),
      status: result.status,
    };
  }

  /**
   * POST /billing/refund/check
   *
   * Kiểm tra tính toàn vẹn của yêu cầu hoàn tiền (chỉ đọc, không ghi).
   * Dùng cho frontend pre-validation trước khi submit.
   *
   * Anti-IDOR: tenantId từ auth context.
   */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  async checkRefund(
    @Req() req: Request,
    @Body() body: RefundRequestDto,
  ): Promise<IntegrityCheckDto> {
    const tenantId = this.resolveTenantId(req);
    const validated = this.validateDto(body);
    const amount = BigInt(Math.round(validated.amount));

    const integrity = await this.refundService.checkRefundIntegrity({
      tenantId,
      originalReferenceId: validated.originalReferenceId,
      amount,
      description: validated.description,
      metadata: validated.metadata,
    });

    return {
      pass: integrity.pass,
      originalAmount: integrity.originalAmount.toString(),
      totalRefunded: integrity.totalRefunded.toString(),
      requestedAmount: integrity.requestedAmount.toString(),
      remainingAvailable: integrity.remainingAvailable.toString(),
      details: integrity.details,
    };
  }

  // ================================================================
  // PRIVATE HELPERS
  // ================================================================

  /**
   * Giải mã tenantId từ auth context.
   * Anti-IDOR cốt lõi: tenantId luôn lấy từ context đã xác thực,
   * không bao giờ từ body request.
   */
  private resolveTenantId(req: Request): string {
    const ctx = (req as RequestWithContext).context;

    if (!ctx?.tenant?.id) {
      this.logger.warn(
        `Blocked unauthenticated refund request | ip=${req.ip} | path=${req.originalUrl}`,
      );
      throw new UnauthorizedException(
        'Yêu cầu xác thực tenant để thực hiện hoàn tiền',
      );
    }

    return ctx.tenant.id;
  }

  /**
   * Validate DTO từ client.
   * - originalReferenceId: bắt buộc, non-empty
   * - amount: bắt buộc, positive number
   * - description: optional string
   * - metadata: optional object
   */
  private validateDto(body: RefundRequestDto): Required<Pick<RefundRequestDto, 'originalReferenceId' | 'amount'>> &
    Pick<RefundRequestDto, 'description' | 'metadata'> {
    const errors: string[] = [];

    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Body request không hợp lệ.');
    }

    if (!body.originalReferenceId || typeof body.originalReferenceId !== 'string') {
      errors.push('originalReferenceId là bắt buộc và phải là string.');
    }

    if (
      body.amount === undefined ||
      body.amount === null ||
      typeof body.amount !== 'number' ||
      !Number.isFinite(body.amount) ||
      body.amount <= 0
    ) {
      errors.push('amount là bắt buộc và phải là số dương.');
    }

    if (body.description !== undefined && typeof body.description !== 'string') {
      errors.push('description phải là string (nếu có).');
    }

    if (
      body.metadata !== undefined &&
      (typeof body.metadata !== 'object' || body.metadata === null || Array.isArray(body.metadata))
    ) {
      errors.push('metadata phải là object (nếu có).');
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Dữ liệu đầu vào không hợp lệ.',
        errors,
      });
    }

    return {
      originalReferenceId: body.originalReferenceId!.trim(),
      amount: body.amount!,
      description: body.description,
      metadata: body.metadata,
    };
  }
}
