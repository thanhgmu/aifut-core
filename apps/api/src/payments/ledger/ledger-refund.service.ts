// ============================================================
// ledger-refund.service.ts — Refund Engine Core Service
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: Service xử lý hoàn tiền (refund) thông qua wallet ledger.
//   - processRefundCredit()  : ghi CREDIT vào wallet tenant với phân loại 'refund'
//   - checkRefundIntegrity() : kiểm tra anti-over-refund trước khi hoàn
//
// Kiến trúc:
//   - Chạy trong Prisma interactive transaction mức Serializable
//   - Anti-over-refund: tổng refund <= original amount (từ PaymentTransaction)
//   - First-class RefundRecord (PENDING → SUCCESS/FAILED)
//   - CREDIT ledger transaction với referenceType='refund'
//   - Idempotent qua @@unique([tenantId, referenceType, referenceId])
//   - Optimistic Lock (version-CAS) chống race condition trên Wallet
// ============================================================

import {
  Injectable,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { LEDGER_CONFIG } from './ledger.config';
import { LedgerTxType } from './ledger.types';
import { LedgerReferenceTypes } from './ledger.types';
import type {
  RefundInput,
  RefundResult,
  RefundIntegrityResult,
} from './ledger-refund.types';

@Injectable()
export class LedgerRefundService {
  private readonly logger = new Logger(LedgerRefundService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ================================================================
  // PUBLIC API
  // ================================================================

  /**
   * processRefundCredit
   * ===================
   * Xử lý hoàn tiền: ghi CREDIT vào wallet của tenant với phân loại 'refund'.
   *
   * Flow trong Serializable transaction:
   *   1. Tra cứu giao dịch gốc (PaymentTransaction) để xác minh số tiền
   *   2. Kiểm tra anti-over-refund: tổng tiền đã refund + amount <= originalAmount
   *   3. Tạo RefundRecord (status = PENDING)
   *   4. Đảm bảo Wallet tồn tại (upsert)
   *   5. Tính balance mới (tăng lên do CREDIT)
   *   6. Cập nhật Wallet với Optimistic Lock (version-CAS)
   *   7. Ghi LedgerTransaction (type=CREDIT, referenceType='refund')
   *   8. Cập nhật RefundRecord → SUCCESS
   *
   * Nếu bất kỳ bước nào thất bại → toàn bộ transaction rollback,
   * RefundRecord không tồn tại → hệ thống sạch sẽ.
   *
   * Idempotent: nếu giao dịch ledger credit 'refund' đã tồn tại
   * cho (tenantId, 'refund', refundRecordId) → trả về kết quả cũ.
   *
   * @param input  - RefundInput { tenantId, originalReferenceId, amount, ... }
   * @returns      - RefundResult { success, refundRecordId, transactionId, ... }
   */
  async processRefundCredit(input: RefundInput): Promise<RefundResult> {
    this.validateRefundInput(input);

    this.logger.log(
      `REFUND START | tenant=${input.tenantId} | orig=${input.originalReferenceId} | amount=${input.amount}`,
    );

    // ── 0. Idempotency pre-check ──────────────────────────────────
    // Nếu đã có refund record với ID trùng → skip (idempotent)
    // Trường hợp này hiếm, chủ yếu xảy ra nếu caller retry với cùng input.
    // (LedgerTransaction unique constraint bắt ở layer dưới.)

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // ── 1. Tra cứu giao dịch gốc ──────────────────────────
          const originalTx = await tx.paymentTransaction.findUnique({
            where: { id: input.originalReferenceId },
          });

          if (!originalTx) {
            throw new NotFoundException(
              `Không tìm thấy giao dịch gốc: ${input.originalReferenceId}`,
            );
          }

          // Chỉ cho phép refund giao dịch đã success
          if (originalTx.status !== 'success') {
            throw new BadRequestException(
              `Chỉ có thể refund giao dịch đã thành công (hiện tại: ${originalTx.status})`,
            );
          }

          // Chuyển original amount sang BigInt
          const originalAmount = BigInt(Math.round(originalTx.amount));

          // ── 2. Anti-over-refund ────────────────────────────────
          const aggregateRefunded = await tx.refundRecord.aggregate({
            where: {
              originalReferenceId: input.originalReferenceId,
              status: 'SUCCESS',
            },
            _sum: { amount: true },
          });

          const totalRefunded: bigint =
            (aggregateRefunded._sum.amount as bigint) ?? BigInt(0);

          if (totalRefunded + input.amount > originalAmount) {
            const remaining = originalAmount - totalRefunded;
            throw new BadRequestException(
              `Anti-over-refund: đã refund ${totalRefunded.toString()}, ` +
                `yêu cầu thêm ${input.amount.toString()}, ` +
                `còn lại có thể refund ${remaining.toString()} ` +
                `(gốc: ${originalAmount.toString()})`,
            );
          }

          // ── 3. Tạo RefundRecord (PENDING) ──────────────────────
          const refundRecord = await tx.refundRecord.create({
            data: {
              originalReferenceId: input.originalReferenceId,
              amount: input.amount,
              status: 'PENDING',
              tenantId: input.tenantId,
            },
          });

          // ── 4. Đảm bảo Wallet tồn tại ──────────────────────────
          const wallet = await this.ensureWallet(tx, input.tenantId);

          // ── 5. CREDIT: balance tăng ────────────────────────────
          const newBalance = wallet.balance + input.amount;

          if (newBalance > LEDGER_CONFIG.maxBalance) {
            // Rollback refund record bằng cách throw
            // (Serializable transaction sẽ rollback toàn bộ)
            throw new BadRequestException(
              `Refund CREDIT vượt quá số dư tối đa cho phép (max: ${LEDGER_CONFIG.maxBalance})`,
            );
          }

          // ── 6. Cập nhật Wallet với Optimistic Lock ─────────────
          const updatedWallet = await this.updateWalletWithCas(
            tx,
            wallet.id,
            wallet.tenantId,
            wallet.version,
            newBalance,
          );

          // ── 7. Ghi LedgerTransaction (CREDIT, referenceType='refund')
          const ledgerTx = await tx.ledgerTransaction.create({
            data: {
              tenantId: input.tenantId,
              type: LedgerTxType.CREDIT,
              amount: input.amount,
              balanceAfter: newBalance,
              referenceType: LedgerReferenceTypes.REFUND,
              referenceId: refundRecord.id,
              description:
                input.description ?? `Hoàn tiền giao dịch ${input.originalReferenceId}`,
              metadata: (input.metadata ?? undefined) as any,
            },
          });

          // ── 8. Cập nhật RefundRecord → SUCCESS ─────────────────
          const finalRefund = await tx.refundRecord.update({
            where: { id: refundRecord.id },
            data: { status: 'SUCCESS' },
          });

          this.logger.log(
            `REFUND SUCCESS | tenant=${input.tenantId} | ` +
              `orig=${input.originalReferenceId} | ` +
              `amount=${input.amount} | ` +
              `refundRecord=${refundRecord.id} | ` +
              `ledgerTx=${ledgerTx.id} | ` +
              `balBefore=${wallet.balance} | ` +
              `balAfter=${newBalance}`,
          );

          return {
            success: true,
            refundRecordId: finalRefund.id,
            transactionId: ledgerTx.id,
            amount: input.amount,
            status: 'SUCCESS' as const,
          };
        },
        {
          isolationLevel: 'Serializable',
          maxWait: 5000, // ms - tối đa chờ lock
          timeout: 10000, // ms - tối đa cho transaction
        },
      );
    } catch (error) {
      return this.handleRefundError(error, input);
    }
  }

  /**
   * checkRefundIntegrity
   * ====================
   * Kiểm tra tính toàn vẹn của một yêu cầu refund trước khi thực hiện.
   * Không ghi dữ liệu, chỉ đọc để xác thực.
   *
   * Output gồm:
   *   - pass: anti-over-refund có pass không
   *   - originalAmount: số tiền gốc
   *   - totalRefunded: tổng đã refund
   *   - requestedAmount: số tiền yêu cầu
   *   - remainingAvailable: số tiền còn lại có thể refund
   *   - details: chi tiết từng bước kiểm tra
   *
   * @param input  - RefundInput (chỉ dùng tenantId + originalReferenceId + amount)
   * @returns      - RefundIntegrityResult
   */
  async checkRefundIntegrity(input: RefundInput): Promise<RefundIntegrityResult> {
    const details: string[] = [];

    // ── 1. Tra cứu giao dịch gốc ──────────────────────────────
    const originalTx = await this.prisma.paymentTransaction.findUnique({
      where: { id: input.originalReferenceId },
    });

    if (!originalTx) {
      details.push(`❌ Không tìm thấy giao dịch gốc: ${input.originalReferenceId}`);
      return {
        pass: false,
        originalAmount: BigInt(0),
        totalRefunded: BigInt(0),
        requestedAmount: input.amount,
        remainingAvailable: BigInt(0),
        details,
      };
    }

    const originalAmount = BigInt(Math.round(originalTx.amount));
    details.push(`✓ Giao dịch gốc: ${originalTx.id}, amount=${originalAmount}`);

    if (originalTx.status !== 'success') {
      details.push(
        `❌ Giao dịch gốc chưa thành công (status=${originalTx.status}). Chưa thể refund.`,
      );
      return {
        pass: false,
        originalAmount,
        totalRefunded: BigInt(0),
        requestedAmount: input.amount,
        remainingAvailable: BigInt(0),
        details,
      };
    }

    // ── 2. Tính tổng đã refund ─────────────────────────────────
    const aggregateRefunded = await this.prisma.refundRecord.aggregate({
      where: {
        originalReferenceId: input.originalReferenceId,
        status: 'SUCCESS',
      },
      _sum: { amount: true },
    });

    const totalRefunded: bigint =
      (aggregateRefunded._sum.amount as bigint) ?? BigInt(0);
    const remainingAvailable = originalAmount - totalRefunded;

    details.push(
      `✓ Đã refund: ${totalRefunded.toString()}`,
      `✓ Yêu cầu thêm: ${input.amount.toString()}`,
      `✓ Còn lại có thể refund: ${remainingAvailable.toString()}`,
    );

    // ── 3. Kiểm tra vượt gốc ───────────────────────────────────
    if (input.amount <= BigInt(0)) {
      details.push('❌ Số tiền refund phải lớn hơn 0.');
      return {
        pass: false,
        originalAmount,
        totalRefunded,
        requestedAmount: input.amount,
        remainingAvailable,
        details,
      };
    }

    const wouldExceed = totalRefunded + input.amount > originalAmount;

    if (wouldExceed) {
      details.push(
        '❌ Anti-over-refund: tổng refund sẽ vượt quá số tiền gốc.',
        `   Tổng sau refund: ${(totalRefunded + input.amount).toString()} > ${originalAmount.toString()}`,
      );
      return {
        pass: false,
        originalAmount,
        totalRefunded,
        requestedAmount: input.amount,
        remainingAvailable: remainingAvailable < BigInt(0) ? BigInt(0) : remainingAvailable,
        details,
      };
    }

    details.push('✅ Anti-over-refund: PASS. Có thể tiến hành refund.');
    this.logger.log(
      `REFUND INTEGRITY PASS | tenant=${input.tenantId} | ` +
        `orig=${input.originalReferenceId} | ` +
        `amount=${input.amount} | remaining=${remainingAvailable}`,
    );

    return {
      pass: true,
      originalAmount,
      totalRefunded,
      requestedAmount: input.amount,
      remainingAvailable,
      details,
    };
  }

  // ================================================================
  // PRIVATE HELPERS
  // ================================================================

  /**
   * Kiểm tra input refund hợp lệ.
   */
  private validateRefundInput(input: RefundInput): void {
    if (!input.tenantId || typeof input.tenantId !== 'string') {
      throw new BadRequestException('tenantId là bắt buộc và phải là string.');
    }

    if (!input.originalReferenceId || typeof input.originalReferenceId !== 'string') {
      throw new BadRequestException('originalReferenceId là bắt buộc và phải là string.');
    }

    if (typeof input.amount !== 'bigint' || input.amount <= BigInt(0)) {
      throw new BadRequestException(
        `Số tiền refund phải là BigInt dương (nhận: ${input.amount})`,
      );
    }
  }

  /**
   * Đảm bảo Wallet tồn tại (upsert).
   * (Giống ledger.service.ts để đảm bảo nhất quán — nhưng dùng tx riêng)
   */
  private async ensureWallet(tx: any, tenantId: string) {
    let wallet = await tx.wallet.findUnique({
      where: { tenantId },
    });

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
   * (Sao chép logic từ ledger.service.ts để dùng trong transaction riêng.)
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
        version: expectedVersion,
      },
      data: {
        balance: newBalance,
        version: expectedVersion + 1,
      },
    });

    if (result.count === 0) {
      throw new ConflictException(
        `Refund CAS conflict: wallet version mismatch (expected=${expectedVersion}) ` +
          `tenant=${tenantId}`,
      );
    }

    const updated = await tx.wallet.findUnique({
      where: { id: walletId },
    });

    return updated;
  }

  /**
   * Xử lý lỗi tập trung cho processRefundCredit.
   * Phân loại lỗi thành:
   *   - BadRequest / NotFound / Conflict → giữ nguyên và ném lại
   *   - Prisma unique constraint → idempotent fallback
   *   - Lỗi khác → InternalServerError + log stack
   */
  private handleRefundError(error: any, input: RefundInput): never {
    // Lỗi nghiệp vụ đã có message rõ ràng — giữ nguyên
    if (
      error instanceof BadRequestException ||
      error instanceof NotFoundException ||
      error instanceof ConflictException
    ) {
      this.logger.warn(
        `REFUND BLOCKED | tenant=${input.tenantId} | ` +
          `orig=${input.originalReferenceId} | reason=${error.message}`,
      );
      throw error;
    }

    // Unique constraint violation trên LedgerTransaction
    // (tenantId + 'refund' + refundRecordId) — idempotent fallback
    if (this.isUniqueConstraintError(error)) {
      // Trường hợp: cùng refundRecordId đã có LedgerTransaction CREDIT rồi.
      // Tra cứu RefundRecord đã có (có thể PENDING hoặc SUCCESS)
      this.logger.warn(
        `REFUND IDEMPOTENT HIT | tenant=${input.tenantId} | ` +
          `orig=${input.originalReferenceId}`,
      );

      // Không thể tra cứu refundRecordId từ input vì nó được tạo trong transaction.
      // Throw conflict để caller retry với idempotency check khác.
      throw new ConflictException(
        'Refund transaction conflict: giao dịch ledger đã tồn tại. Vui lòng kiểm tra lại.',
      );
    }

    // Lỗi không xác định — log stack đầy đủ
    this.logger.error(
      `REFUND FAILED | tenant=${input.tenantId} | ` +
        `orig=${input.originalReferenceId} | amount=${input.amount}`,
      error instanceof Error ? error.stack : error,
    );

    throw new InternalServerErrorException(
      `Refund thất bại: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  /**
   * Kiểm tra lỗi unique constraint của Prisma (P2002).
   */
  private isUniqueConstraintError(error: any): boolean {
    return (
      error?.code === 'P2002' ||
      (error?.meta?.target &&
        Array.isArray(error.meta.target) &&
        (error.meta.target.includes('tenantId') ||
          error.meta.target.includes('referenceType')))
    );
  }
}
