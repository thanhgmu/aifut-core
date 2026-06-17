// ============================================================
// ledger.controller.ts — Wallet Ledger API Endpoints
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: API endpoints cho internal wallet ledger.
// Anti-IDOR: tenantId được lấy từ auth context (req.context.tenant.id),
// không từ URL params hay body, nhằm ngăn chặn truy cập trái phép.
// ============================================================

import {
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequestWithContext } from '../../common/middleware/dev-context.middleware';
import { LedgerService } from './ledger.service';

/** Response DTO: chuyển đổi BigInt → string để tránh lỗi JSON serialization */
interface BalanceResponse {
  tenantId: string;
  balance: string;
  currency: string;
}

/** Response DTO: một transaction trong lịch sử */
interface HistoryItem {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  referenceType: string;
  referenceId: string;
  description: string | null;
  createdAt: string;
}

/** Response DTO: page lịch sử */
interface HistoryResponse {
  items: HistoryItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

@Controller('billing/wallet')
export class LedgerController {
  private readonly logger = new Logger(LedgerController.name);

  constructor(private readonly ledgerService: LedgerService) {}

  /**
   * GET /billing/wallet/balance
   * Trả về số dư thực tế của tenant hiện tại.
   * Anti-IDOR: tenantId lấy từ req.context.tenant.id, không thể giả mạo.
   */
  @Get('balance')
  async getBalance(@Req() req: Request): Promise<BalanceResponse> {
    const tenantId = this.resolveTenantId(req);

    const wallet = await this.ledgerService.getOrCreateWallet(tenantId);

    this.logger.debug(`Balance check | tenant=${tenantId} | balance=${wallet.balance}`);

    return {
      tenantId,
      balance: wallet.balance.toString(),
      currency: 'VND',
    };
  }

  /**
   * GET /billing/wallet/history
   * Lịch sử biến động số dư với cursor-based pagination.
   *
   * Query params:
   *   - cursor: string (transaction ID của item cuối cùng ở page trước, optional)
   *   - limit: number (số item tối đa, mặc định 20, tối đa 100)
   *   - type: string (lọc theo LedgerTxType: CREDIT | DEBIT, optional)
   *
   * Anti-IDOR: tenantId lấy từ req.context.tenant.id.
   */
  @Get('history')
  async getHistory(
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit') limitParam?: string,
    @Query('type') typeFilter?: string,
  ): Promise<HistoryResponse> {
    const tenantId = this.resolveTenantId(req);

    const limit = Math.min(Math.max(Number(limitParam) || 20, 1), 100);

    // Validate type filter nếu có
    if (typeFilter && !['CREDIT', 'DEBIT'].includes(typeFilter.toUpperCase())) {
      throw new BadRequestException(
        `Invalid type filter. Allowed values: CREDIT, DEBIT (received: ${typeFilter})`,
      );
    }

    const result = await this.ledgerService.queryTransactionHistory({
      tenantId,
      cursor,
      limit,
      typeFilter: typeFilter?.toUpperCase() as 'CREDIT' | 'DEBIT' | undefined,
    });

    return {
      items: result.items.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount.toString(),
        balanceAfter: tx.balanceAfter.toString(),
        referenceType: tx.referenceType as string,
        referenceId: tx.referenceId,
        description: tx.description,
        createdAt: tx.createdAt instanceof Date
          ? tx.createdAt.toISOString()
          : String(tx.createdAt),
      })),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ================================================================
  // PRIVATE HELPERS
  // ================================================================

  /**
   * Giải mã tenantId từ auth context.
   * Anti-IDOR cốt lõi: tenantId luôn lấy từ context đã được xác thực,
   * không bao giờ từ tham số URL hay body request.
   * Ném UnauthorizedException nếu không có tenant context.
   */
  private resolveTenantId(req: Request): string {
    const ctx = (req as RequestWithContext).context;

    if (!ctx?.tenant?.id) {
      this.logger.warn(
        `Blocked unauthenticated wallet access | ip=${req.ip} | path=${req.originalUrl}`,
      );
      throw new UnauthorizedException(
        'Yêu cầu xác thực tenant để truy cập ví điện tử',
      );
    }

    return ctx.tenant.id;
  }
}
