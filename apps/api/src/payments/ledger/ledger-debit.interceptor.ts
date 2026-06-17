// ============================================================
// ledger-debit.interceptor.ts — Automatic AI Debit Interceptor
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: NestJS interceptor bọc luồng gọi AI.
//   - Tự động tính toán chi phí dựa trên token tiêu thụ
//   - Kiểm tra số dư > 0 trước khi cho request đi qua
//   - Gọi ledgerService.debitBalance() để trừ tiền nguyên tử
//     ngay khi request kết thúc thành công
//   - Nếu số dư = 0 trước khi xử lý, ném HTTP 402 INSUFFICIENT_FUNDS
// ============================================================

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, from, throwError } from 'rxjs';
import { switchMap, tap, catchError } from 'rxjs/operators';
import { Request } from 'express';
import { RequestWithContext } from '../../common/middleware/dev-context.middleware';
import { LedgerService } from './ledger.service';
import { LedgerReferenceTypes } from './ledger.types';

/**
 * Cấu trúc ước tính chi phí cho một lần gọi AI.
 */
interface AiCostEstimate {
  /** Tổng số token đầu vào */
  inputTokens: number;
  /** Tổng số token đầu ra */
  outputTokens: number;
  /** Tổng chi phí ước tính (đơn vị VND, BigInt-compatible) */
  estimatedCost: bigint;
}

/**
 * Giá tiền mặc định cho mỗi 1K token (VND).
 * Có thể override bằng environment variable.
 * Đây là giá tạm thời — sau này sẽ lấy từ pricing service.
 */
const DEFAULT_INPUT_TOKEN_RATE = BigInt(
  process.env.AI_TOKEN_INPUT_RATE_VND_PER_1K || '50',
);
const DEFAULT_OUTPUT_TOKEN_RATE = BigInt(
  process.env.AI_TOKEN_OUTPUT_RATE_VND_PER_1K || '200',
);
const MINIMUM_DEBIT = BigInt(
  process.env.AI_MINIMUM_DEBIT_VND || '100',
);

@Injectable()
export class LedgerDebitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LedgerDebitInterceptor.name);
  private readonly inputRate: bigint;
  private readonly outputRate: bigint;
  private readonly minDebit: bigint;

  constructor(private readonly ledgerService: LedgerService) {
    this.inputRate = DEFAULT_INPUT_TOKEN_RATE;
    this.outputRate = DEFAULT_OUTPUT_TOKEN_RATE;
    this.minDebit = MINIMUM_DEBIT;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req: Request = context.switchToHttp().getRequest();
    const tenantId = this.resolveTenantId(req);

    // Nếu không có tenant context → cho request đi qua (không debit)
    if (!tenantId) {
      this.logger.warn('No tenant context — skipping wallet debit check');
      return next.handle();
    }

    // 1. Tính chi phí ước tính từ request body
    const costEstimate = this.estimateAiCost(req);

    // 2. Kiểm tra số dư TRƯỚC → nếu đủ, cho request đi qua → debit SAU
    return from(this.checkSufficientFunds(tenantId, costEstimate.estimatedCost)).pipe(
      switchMap(() => next.handle()),
      tap({
        next: () => {
          // Request thành công → debit ngay (async, không block response)
          this.performDebit(tenantId, costEstimate, req).catch((err) => {
            this.logger.error(
              `Post-call debit failed | tenant=${tenantId} | cost=${costEstimate.estimatedCost}`,
              err,
            );
          });
        },
      }),
      catchError((err) => {
        // Nếu lỗi là INSUFFICIENT_FUNDS từ checkSufficientFunds → giữ nguyên
        // Nếu lỗi từ handler → không debit, throw qua
        return throwError(() => err);
      }),
    );
  }

  // ================================================================
  // COST ESTIMATION
  // ================================================================

  /**
   * Ước tính chi phí AI dựa trên request body.
   *
   * Chiến lược estimation:
   *   1. Nếu request body có trường `estimatedTokens`, dùng trực tiếp
   *   2. Nếu không, ước tính từ độ dài message/prompt trong body
   *   3. Fallback: debit tối thiểu nếu không thể ước tính
   */
  private estimateAiCost(req: Request): AiCostEstimate {
    const body = req.body as Record<string, any> | undefined;

    // Ưu tiên 1: client đã gửi token count
    if (body?.estimatedInputTokens != null || body?.estimatedOutputTokens != null) {
      const inputTokens = Number(body.estimatedInputTokens) || 0;
      const outputTokens = Number(body.estimatedOutputTokens) || 0;
      return {
        inputTokens,
        outputTokens,
        estimatedCost: this.calculateCost(inputTokens, outputTokens),
      };
    }

    // Ưu tiên 2: ước tính từ message content
    const inputTokens =
      this.roughTokenCount(body?.messages) +
      this.roughTokenCount(body?.prompt) +
      this.roughTokenCount(body?.content) +
      this.roughTokenCount(body?.input);

    // Fallback: giả định 100 token input, 50 token output
    const finalInputTokens = inputTokens || 100;
    const finalOutputTokens = 50;

    return {
      inputTokens: finalInputTokens,
      outputTokens: finalOutputTokens,
      estimatedCost: this.calculateCost(finalInputTokens, finalOutputTokens),
    };
  }

  /**
   * Ước tính rough token count từ text.
   * Rule of thumb: 1 token ≈ 4 ký tự.
   */
  private roughTokenCount(text: unknown): number {
    if (!text) return 0;

    const str =
      typeof text === 'string'
        ? text
        : typeof text === 'object'
          ? JSON.stringify(text)
          : String(text);

    return Math.ceil(str.length / 4);
  }

  /**
   * Tính chi phí VND từ token counts.
   */
  private calculateCost(inputTokens: number, outputTokens: number): bigint {
    const inputCost = (BigInt(inputTokens) * this.inputRate) / BigInt(1000);
    const outputCost = (BigInt(outputTokens) * this.outputRate) / BigInt(1000);
    const total = inputCost + outputCost;

    // Đảm bảo không debit dưới mức tối thiểu
    return total < this.minDebit ? this.minDebit : total;
  }

  // ================================================================
  // BALANCE CHECK & DEBIT
  // ================================================================

  /**
   * Kiểm tra số dư đủ để thực hiện giao dịch.
   * Ném HTTP 402 INSUFFICIENT_FUNDS nếu balance ≤ 0.
   */
  private async checkSufficientFunds(
    tenantId: string,
    requiredAmount: bigint,
  ): Promise<void> {
    const wallet = await this.ledgerService.getOrCreateWallet(tenantId);

    if (wallet.balance <= BigInt(0)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          error: 'INSUFFICIENT_FUNDS',
          message: `Số dư ví không đủ. Vui lòng nạp thêm để sử dụng dịch vụ AI. (balance: ${wallet.balance})`,
          balance: wallet.balance.toString(),
          required: requiredAmount.toString(),
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    if (wallet.balance < requiredAmount) {
      this.logger.warn(
        `Low balance for AI call | tenant=${tenantId} | balance=${wallet.balance} | estimated=${requiredAmount}`,
      );
      // Cho phép đi qua — debit sẽ lấy estimated cost
    }
  }

  /**
   * Thực hiện debit sau khi request AI thành công.
   */
  private async performDebit(
    tenantId: string,
    cost: AiCostEstimate,
    req: Request,
  ): Promise<void> {
    try {
      const result = await this.ledgerService.debitBalance({
        tenantId,
        amount: cost.estimatedCost,
        referenceType: LedgerReferenceTypes.SYSTEM_CREDIT,
        referenceId: this.buildReferenceId(req),
        description: `AI call: ${cost.inputTokens} in / ${cost.outputTokens} out = ${cost.estimatedCost} VND`,
        metadata: {
          inputTokens: cost.inputTokens,
          outputTokens: cost.outputTokens,
          estimatedCost: cost.estimatedCost.toString(),
          path: req.originalUrl,
          method: req.method,
        },
      });

      if (result.success) {
        this.logger.debug(
          `AI debit OK | tenant=${tenantId} | cost=${cost.estimatedCost} | tx=${result.transactionId} | bal=${result.balanceAfter}`,
        );
      }
    } catch (error) {
      // Debit lỗi — log nhưng không block response đã thành công
      this.logger.error(
        `AI debit FAILED (async reconcile needed) | tenant=${tenantId} | cost=${cost.estimatedCost}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  // ================================================================
  // HELPERS
  // ================================================================

  /**
   * Tạo reference ID duy nhất cho mỗi lần gọi AI.
   */
  private buildReferenceId(req: Request): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `ai_call_${timestamp}_${random}`;
  }

  /**
   * Giải mã tenantId từ request context.
   */
  private resolveTenantId(req: Request): string | null {
    const ctx = (req as RequestWithContext).context;
    return ctx?.tenant?.id ?? null;
  }
}
