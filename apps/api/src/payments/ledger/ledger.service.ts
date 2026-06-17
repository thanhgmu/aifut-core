// ============================================================
// ledger.service.ts — Wallet Ledger Core Service
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: Service xử lý debit/credit với:
//   - Prisma interactive transaction
//   - Optimistic Lock (version-CAS) chống race condition
//   - Kiểm tra số dư trước debit
//   - Append-only LedgerTransaction (không sửa/xóa)
//   - Idempotency qua @@unique([tenantId, referenceType, referenceId])
// ============================================================

import {
  Injectable,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { LEDGER_CONFIG } from './ledger.config';
import {
  LedgerTxType,
  LedgerReferenceType,
  DebitInput,
  CreditInput,
  BalanceCheckInput,
  LedgerResult,
  WalletRecord,
  LedgerTransactionRecord,
} from './ledger.types';

/**
 * Query options cho getTransactionHistory (cursor-based pagination).
 */
export interface TransactionHistoryQuery {
  tenantId: string;
  cursor?: string;
  limit: number;
  typeFilter?: 'CREDIT' | 'DEBIT';
}

/**
 * Kết quả của getTransactionHistory.
 */
export interface TransactionHistoryResult {
  items: LedgerTransactionRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ================================================================
  // PUBLIC API
  // ================================================================

  /**
   * Ghi có (nạp tiền) vào wallet của tenant.
   * Idempotent: nếu đã tồn tại giao dịch với cùng (tenantId, referenceType, referenceId)
   * thì trả về kết quả của giao dịch cũ — không tạo giao dịch mới.
   */
  async creditBalance(input: CreditInput, retryCount = 0): Promise<LedgerResult> {
    this.validateAmount(input.amount, 'CREDIT');

    const existing = await this.findExistingTransaction(
      input.tenantId,
      input.referenceType,
      input.referenceId,
    );
    if (existing) {
      // Idempotent: trả về kết quả giao dịch đã tồn tại
      return this.buildResult(existing, true);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Đảm bảo Wallet tồn tại (upsert)
        const wallet = await this.ensureWallet(tx, input.tenantId);

        // 2. CREDIT: balance tăng
        const newBalance = wallet.balance + input.amount;

        // 3. Kiểm tra giới hạn
        if (newBalance > LEDGER_CONFIG.maxBalance) {
          throw new BadRequestException(
            `CREDIT vượt quá số dư tối đa cho phép (max: ${LEDGER_CONFIG.maxBalance})`,
          );
        }

        // 4. Cập nhật wallet với Optimistic Lock
        const updatedWallet = await this.updateWalletWithCas(
          tx,
          wallet.id,
          wallet.tenantId,
          wallet.version,
          newBalance,
        );

        // 5. Ghi LedgerTransaction (append-only)
        const transaction = await tx.ledgerTransaction.create({
          data: {
            tenantId: input.tenantId,
            type: LedgerTxType.CREDIT,
            amount: input.amount,
            balanceAfter: newBalance,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            description: input.description ?? null,
            metadata: (input.metadata ?? undefined) as any,
          },
        });

        this.logger.log(
          `CREDIT | tenant=${input.tenantId} | amount=${input.amount} | bal=${newBalance} | ref=${input.referenceType}:${input.referenceId}`,
        );

        return {
          success: true,
          walletId: updatedWallet.id,
          transactionId: transaction.id,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          version: updatedWallet.version,
        };
      });
    } catch (error) {
      // Optimistic Lock conflict — retry
      if (this.isCasConflict(error) && retryCount < LEDGER_CONFIG.maxRetryOnLockConflict) {
        this.logger.warn(
          `CREDIT CAS conflict (attempt ${retryCount + 1}), retrying... tenant=${input.tenantId}`,
        );
        return this.creditBalance(input, retryCount + 1);
      }

      // Idempotent conflict: giao dịch đã được tạo bởi request song song
      if (this.isUniqueConstraintError(error)) {
        const existingAfterConflict = await this.findExistingTransaction(
          input.tenantId,
          input.referenceType,
          input.referenceId,
        );
        if (existingAfterConflict) {
          return this.buildResult(existingAfterConflict, true);
        }
      }

      this.handleError(error, 'CREDIT', input);
    }
  }

  /**
   * Ghi nợ (rút tiền) từ wallet của tenant.
   * Kiểm tra số dư trước khi ghi. Idempotent.
   */
  async debitBalance(input: DebitInput, retryCount = 0): Promise<LedgerResult> {
    this.validateAmount(input.amount, 'DEBIT');

    const existing = await this.findExistingTransaction(
      input.tenantId,
      input.referenceType,
      input.referenceId,
    );
    if (existing) {
      return this.buildResult(existing, true);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Đảm bảo Wallet tồn tại
        const wallet = await this.ensureWallet(tx, input.tenantId);

        // 2. DEBIT: balance giảm — kiểm tra số dư
        const newBalance = wallet.balance - input.amount;

        // 3. Kiểm tra số dư (không cho phép âm nếu maxOverdraft = 0)
        if (newBalance < LEDGER_CONFIG.maxOverdraft) {
          throw new BadRequestException(
            `Số dư không đủ: cần ${input.amount}, hiện có ${wallet.balance}`,
          );
        }

        // 4. Cập nhật wallet với Optimistic Lock
        const updatedWallet = await this.updateWalletWithCas(
          tx,
          wallet.id,
          wallet.tenantId,
          wallet.version,
          newBalance,
        );

        // 5. Ghi LedgerTransaction (append-only)
        const transaction = await tx.ledgerTransaction.create({
          data: {
            tenantId: input.tenantId,
            type: LedgerTxType.DEBIT,
            amount: input.amount,
            balanceAfter: newBalance,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            description: input.description ?? null,
            metadata: (input.metadata ?? undefined) as any,
          },
        });

        this.logger.log(
          `DEBIT  | tenant=${input.tenantId} | amount=${input.amount} | bal=${newBalance} | ref=${input.referenceType}:${input.referenceId}`,
        );

        return {
          success: true,
          walletId: updatedWallet.id,
          transactionId: transaction.id,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          version: updatedWallet.version,
        };
      });
    } catch (error) {
      if (this.isCasConflict(error) && retryCount < LEDGER_CONFIG.maxRetryOnLockConflict) {
        this.logger.warn(
          `DEBIT CAS conflict (attempt ${retryCount + 1}), retrying... tenant=${input.tenantId}`,
        );
        return this.debitBalance(input, retryCount + 1);
      }

      if (this.isUniqueConstraintError(error)) {
        const existingAfterConflict = await this.findExistingTransaction(
          input.tenantId,
          input.referenceType,
          input.referenceId,
        );
        if (existingAfterConflict) {
          return this.buildResult(existingAfterConflict, true);
        }
      }

      this.handleError(error, 'DEBIT', input);
    }
  }

  /**
   * Kiểm tra số dư hiện tại của tenant.
   * Trả về { sufficient, balance, required }.
   */
  async checkBalance(input: BalanceCheckInput) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { tenantId: input.tenantId },
    });

    const balance = wallet?.balance ?? BigInt(0);
    return {
      sufficient: balance >= input.requiredAmount,
      balance,
      required: input.requiredAmount,
      shortfall: balance >= input.requiredAmount ? BigInt(0) : input.requiredAmount - balance,
    };
  }

  /**
   * Lấy thông tin wallet của tenant.
   * Tạo mới nếu chưa tồn tại.
   */
  async getOrCreateWallet(tenantId: string): Promise<WalletRecord> {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.ensureWallet(tx, tenantId);
      return wallet;
    });
  }

  /**
   * Lấy lịch sử giao dịch với cursor-based pagination.
   * Dùng trong LedgerController.getHistory().
   */
  async getTransactionHistory(query: TransactionHistoryResult['items'] extends (infer U)[] ? TransactionHistoryQuery : never): Promise<TransactionHistoryResult> {
    // For type safety, accept typed query
    return this.queryTransactionHistory(query as TransactionHistoryQuery);
  }

  async queryTransactionHistory(query: TransactionHistoryQuery): Promise<TransactionHistoryResult> {
    const { tenantId, cursor, limit, typeFilter } = query;

    const transactions = await this.prisma.ledgerTransaction.findMany({
      where: {
        tenantId,
        ...(typeFilter ? { type: typeFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // lấy thêm 1 để biết còn page sau không
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1, // skip cursor item
          }
        : {}),
    });

    const hasMore = transactions.length > limit;
    const items = transactions.slice(0, limit);

    const mappedItems: LedgerTransactionRecord[] = items.map((tx) => ({
      id: tx.id,
      tenantId: tx.tenantId,
      type: tx.type as LedgerTxType,
      amount: tx.amount,
      balanceAfter: tx.balanceAfter,
      referenceType: tx.referenceType as LedgerReferenceType,
      referenceId: tx.referenceId,
      description: tx.description,
      metadata: tx.metadata as Record<string, unknown> | null,
      createdAt: tx.createdAt,
    }));

    return {
      items: mappedItems,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    };
  }

  // ================================================================
  // PRIVATE HELPERS
  // ================================================================

  /** Đảm bảo Wallet tồn tại (upsert) */
  private async ensureWallet(tx: any, tenantId: string) {
    // Tìm wallet hiện tại
    let wallet = await tx.wallet.findUnique({
      where: { tenantId },
    });

    // Nếu chưa có, tạo mới
    if (!wallet) {
      wallet = await tx.wallet.create({
        data: {
          tenantId,
          balance: BigInt(0),
          version: 1,
        },
      });
    }

    return wallet;
  }

  /**
   * Cập nhật wallet với Compare-And-Set (Optimistic Lock).
   * Chỉ cập nhật nếu version khớp, version++ khi thành công.
   */
  private async updateWalletWithCas(
    tx: any,
    walletId: string,
    tenantId: string,
    expectedVersion: number,
    newBalance: bigint,
  ) {
    const result = await tx.wallet.updateMany({
      where: {
        id: walletId,
        tenantId,
        version: expectedVersion, // CAS: chỉ update nếu version khớp
      },
      data: {
        balance: newBalance,
        version: expectedVersion + 1, // increment version
      },
    });

    // Nếu count = 0, có nghĩa version đã thay đổi → conflict
    if (result.count === 0) {
      throw new ConflictException(
        `Optimistic Lock conflict on wallet tenant=${tenantId}: version mismatch (expected=${expectedVersion})`,
      );
    }

    // Lấy wallet đã cập nhật
    const updated = await tx.wallet.findUnique({
      where: { id: walletId },
    });

    return updated;
  }

  /** Tìm giao dịch đã tồn tại (idempotency) */
  private async findExistingTransaction(
    tenantId: string,
    referenceType: string,
    referenceId: string,
  ) {
    return this.prisma.ledgerTransaction.findUnique({
      where: {
        tenantId_referenceType_referenceId: {
          tenantId,
          referenceType,
          referenceId,
        },
      },
    });
  }

  /** Build LedgerResult từ transaction đã tồn tại */
  private buildResult(existingTx: any, fromExisting: boolean): LedgerResult {
    return {
      success: true,
      walletId: '', // không lấy được từ transaction record
      transactionId: existingTx.id,
      balanceAfter: existingTx.balanceAfter,
      balanceBefore: existingTx.balanceAfter - BigInt(existingTx.type === LedgerTxType.CREDIT ? existingTx.amount : -1n * existingTx.amount),
      version: 0,
      error: fromExisting ? 'Idempotent: transaction already exists' : undefined,
    };
  }

  /** Kiểm tra amount hợp lệ */
  private validateAmount(amount: bigint, operation: string) {
    if (amount <= BigInt(0)) {
      throw new BadRequestException(
        `${operation} amount phải lớn hơn 0 (nhận: ${amount})`,
      );
    }
  }

  /** Kiểm tra lỗi có phải CAS conflict không */
  private isCasConflict(error: any): boolean {
    return error instanceof ConflictException;
  }

  /** Kiểm tra lỗi unique constraint (P2002 = Prisma unique violation) */
  private isUniqueConstraintError(error: any): boolean {
    return (
      error?.code === 'P2002' ||
      (error?.meta?.target &&
        Array.isArray(error.meta.target) &&
        error.meta.target.includes('tenantId') &&
        error.meta.target.includes('referenceType'))
    );
  }

  /** Xử lý lỗi và throw exception phù hợp */
  private handleError(error: any, operation: string, input: any): never {
    if (error instanceof BadRequestException || error instanceof ConflictException) {
      throw error;
    }

    this.logger.error(
      `Ledger ${operation} FAILED | tenant=${input.tenantId} | amount=${input.amount}`,
      error instanceof Error ? error.stack : error,
    );

    throw new InternalServerErrorException(
      `Ledger ${operation} thất bại: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
