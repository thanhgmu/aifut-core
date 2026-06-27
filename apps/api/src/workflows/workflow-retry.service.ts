import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DEFAULT_MAX_RETRIES } from './workflow.constants';

// ── Types ────────────────────────────────────────────────────────────────────

/** Trạng thái của Circuit Breaker cho một workflowId */
enum CircuitState {
  /** Mạch đóng — cho phép thực thi bình thường */
  CLOSED = 'CLOSED',
  /** Mạch ngắt — từ chối thực thi tạm thời */
  OPEN = 'OPEN',
  /** Nửa mở — cho phép một lần thử để kiểm tra phục hồi */
  HALF_OPEN = 'HALF_OPEN',
}

/** Cấu hình Circuit Breaker cho một workflow */
interface CircuitBreakerConfig {
  /** Ngưỡng lỗi liên tiếp để ngắt mạch (mặc định: 5) */
  failureThreshold: number;
  /** Thời gian mạch ở trạng thái OPEN trước khi chuyển HALF_OPEN (ms, mặc định: 30s) */
  resetTimeoutMs: number;
  /** Số lần thử tối đa trong trạng thái HALF_OPEN trước khi mở lại */
  halfOpenMaxRetries: number;
}

/** Trạng thái runtime của Circuit Breaker cho workflow */
interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  halfOpenAttempts: number;
  lastFailureAt: number | null;
  lastError: string | null;
}

/** Cấu hình mặc định cho Circuit Breaker */
const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxRetries: 1,
};

/** Cấu hình mặc định cho Exponential Backoff */
const DEFAULT_BACKOFF_BASE_MS = 1_000; // 1 giây
const DEFAULT_BACKOFF_MAX_MS = 60_000; // 60 giây (1 phút)
const JITTER_FACTOR = 0.3; // ±30% jitter

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class WorkflowRetryService {
  private readonly logger = new Logger(WorkflowRetryService.name);

  /** Bộ nhớ trong cho trạng thái Circuit Breaker (theo workflowId) */
  private readonly circuitStates = new Map<string, CircuitBreakerState>();

  /** Cấu hình Circuit Breaker tuỳ chỉnh (theo workflowId) */
  private readonly customCircuitConfigs = new Map<string, CircuitBreakerConfig>();

  constructor(private readonly prisma: PrismaService) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Thực thi `actionFn` với cơ chế tự động retry (exponential backoff + jitter)
   * kết hợp Circuit Breaker bảo vệ quá tải nếu lỗi liên tiếp vượt ngưỡng.
   *
   * @param tenantId   - Mã Tenant
   * @param workflowId - Mã Workflow (dùng cho Circuit Breaker)
   * @param actionFn   - Hàm bất đồng bộ cần thực thi
   * @param maxRetries - Số lần thử tối đa (mặc định: 3)
   * @param executionId - (Tuỳ chọn) Mã execution để cập nhật trực tiếp vào DB
   */
  async executeWithRetry<T>(
    tenantId: string,
    workflowId: string,
    actionFn: () => Promise<T>,
    maxRetries: number = DEFAULT_MAX_RETRIES,
    executionId?: string,
  ): Promise<T> {
    // ── Bước 1: Kiểm tra Circuit Breaker ──────────────────────────────────
    const cbState = this.ensureCircuitState(workflowId);
    if (cbState.state === CircuitState.OPEN) {
      await this.handleOpenCircuit(tenantId, workflowId, cbState, executionId);
      // Sau thời gian reset, tự động chuyển sang HALF_OPEN
      cbState.state = CircuitState.HALF_OPEN;
      cbState.halfOpenAttempts = 0;
      this.logger.warn(
        `[CircuitBreaker] ${workflowId}: OPEN → HALF_OPEN — cho phép thử phục hồi`,
      );
    }

    // ── Bước 2: Thực thi với retry loop ───────────────────────────────────
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await actionFn();

        // Thành công → reset Circuit Breaker
        this.resetCircuitState(workflowId);
        return result;
      } catch (err: any) {
        lastError = err;

        const isRetryable = this.isRetryableError(err);
        const isLastAttempt = attempt >= maxRetries;

        // Cập nhật execution step nếu có executionId
        await this.recordRetryAttempt(
          tenantId,
          workflowId,
          executionId,
          attempt + 1,
          maxRetries,
          err,
        );

        if (!isRetryable && !isLastAttempt) {
          // Lỗi không retry được → ghi nhận thất bại Circuit Breaker, ném luôn
          this.recordCircuitFailure(workflowId, err.message);
          await this.persistErrorLog(tenantId, workflowId, err, executionId, false);
          throw err;
        }

        if (isLastAttempt) {
          // Hết số lần retry → ghi nhận Circuit Breaker + log DB
          this.recordCircuitFailure(workflowId, err.message);
          await this.persistErrorLog(tenantId, workflowId, err, executionId, true);
          throw new WorkflowRetryExhaustedError(
            `Workflow ${workflowId} thất bại sau ${maxRetries + 1} lần thử: ${err.message}`,
            err,
          );
        }

        // Chưa hết retry → chờ exponential backoff rồi tiếp tục
        const delayMs = this.calculateBackoff(attempt);
        this.logger.warn(
          `[Retry] ${workflowId}: Attempt ${attempt + 1}/${maxRetries + 1} thất bại — ` +
          `đợi ${Math.round(delayMs)}ms trước khi thử lại. Lỗi: ${err.message}`,
        );
        await this.sleep(delayMs);
      }
    }

    // Không bao giờ chạm đến đây, nhưng TypeScript cần return
    throw lastError ?? new Error('executeWithRetry: kết thúc bất ngờ');
  }

  // ── Circuit Breaker Management ────────────────────────────────────────────

  /**
   * Đặt cấu hình Circuit Breaker tuỳ chỉnh cho một workflow.
   * Gọi trước executeWithRetry để override mặc định.
   */
  setCircuitConfig(workflowId: string, config: Partial<CircuitBreakerConfig>): void {
    const current = this.customCircuitConfigs.get(workflowId) ?? { ...DEFAULT_CIRCUIT_CONFIG };
    this.customCircuitConfigs.set(workflowId, { ...current, ...config });
  }

  /**
   * Reset trạng thái Circuit Breaker cho một workflowId.
   * Dùng khi muốn force mở lại nguồn sau khi đã sửa lỗi thủ công.
   */
  resetCircuitState(workflowId: string): void {
    this.circuitStates.delete(workflowId);
    this.logger.log(`[CircuitBreaker] ${workflowId}: Reset — trạng thái khởi tạo lại`);
  }

  /**
   * Lấy trạng thái hiện tại của Circuit Breaker (để debug/monitor).
   */
  getCircuitState(workflowId: string): { state: CircuitState; failureCount: number } | null {
    const state = this.circuitStates.get(workflowId);
    if (!state) return null;
    return { state: state.state, failureCount: state.failureCount };
  }

  /**
   * Lấy tất cả trạng thái Circuit Breaker hiện tại (dùng cho dashboard health).
   */
  getAllCircuitStates(): Array<{ workflowId: string; state: CircuitState; failureCount: number }> {
    const result: Array<{ workflowId: string; state: CircuitState; failureCount: number }> = [];
    for (const [workflowId, state] of this.circuitStates.entries()) {
      result.push({ workflowId, state: state.state, failureCount: state.failureCount });
    }
    return result;
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Khởi tạo hoặc lấy trạng thái Circuit Breaker cho workflowId.
   */
  private ensureCircuitState(workflowId: string): CircuitBreakerState {
    let state = this.circuitStates.get(workflowId);
    if (!state) {
      state = {
        state: CircuitState.CLOSED,
        failureCount: 0,
        halfOpenAttempts: 0,
        lastFailureAt: null,
        lastError: null,
      };
      this.circuitStates.set(workflowId, state);
    }
    return state;
  }

  /**
   * Lấy cấu hình Circuit Breaker cho workflow (ưu tiên custom, fallback mặc định).
   */
  private getConfig(workflowId: string): CircuitBreakerConfig {
    return this.customCircuitConfigs.get(workflowId) ?? DEFAULT_CIRCUIT_CONFIG;
  }

  /**
   * Xử lý khi Circuit Breaker đang OPEN:
   * Kiểm tra nếu đã qua resetTimeout → chuyển HALF_OPEN.
   * Nếu chưa → ném lỗi ngay lập tức.
   */
  private async handleOpenCircuit(
    tenantId: string,
    workflowId: string,
    cbState: CircuitBreakerState,
    executionId?: string,
  ): Promise<void> {
    const config = this.getConfig(workflowId);
    const now = Date.now();
    const elapsedSinceLastFailure = cbState.lastFailureAt ? now - cbState.lastFailureAt : 0;

    if (elapsedSinceLastFailure < config.resetTimeoutMs) {
      const remainingMs = config.resetTimeoutMs - elapsedSinceLastFailure;
      this.logger.warn(
        `[CircuitBreaker] ${workflowId}: OPEN — từ chối thực thi. ` +
        `Còn ${Math.round(remainingMs / 1000)}s trước khi thử lại.`,
      );

      // Ghi nhận lỗi vào DB để audit
      await this.persistErrorLog(
        tenantId,
        workflowId,
        new Error(`Circuit Breaker OPEN: workflow ${workflowId} bị từ chối`),
        executionId,
        false,
        true, // isCircuitBreaker
      );

      throw new CircuitBreakerOpenError(
        `Workflow ${workflowId} đang trong trạng thái Circuit Breaker OPEN. ` +
        `Thử lại sau ${Math.round(remainingMs / 1000)} giây.`,
      );
    }

    // Đã qua resetTimeout → tự động chuyển HALF_OPEN (đã xử lý ở caller)
    this.logger.log(
      `[CircuitBreaker] ${workflowId}: OPEN timeout expired (${config.resetTimeoutMs}ms) — chuẩn bị HALF_OPEN`,
    );
  }

  /**
   * Ghi nhận một lần thất bại vào Circuit Breaker.
   * Nếu vượt ngưỡng → chuyển sang OPEN.
   */
  private recordCircuitFailure(workflowId: string, errorMessage: string): void {
    const cbState = this.ensureCircuitState(workflowId);
    const config = this.getConfig(workflowId);

    cbState.failureCount++;
    cbState.lastFailureAt = Date.now();
    cbState.lastError = errorMessage;

    if (cbState.state === CircuitState.HALF_OPEN) {
      cbState.halfOpenAttempts++;
    }

    // Kiểm tra ngưỡng để ngắt mạch
    const shouldOpen =
      cbState.failureCount >= config.failureThreshold ||
      (cbState.state === CircuitState.HALF_OPEN &&
        cbState.halfOpenAttempts >= config.halfOpenMaxRetries);

    if (shouldOpen && cbState.state !== CircuitState.OPEN) {
      cbState.state = CircuitState.OPEN;
      this.logger.error(
        `[CircuitBreaker] ${workflowId}: CLOSED → OPEN ` +
        `(lỗi liên tiếp: ${cbState.failureCount}/${config.failureThreshold})`,
      );
    }

    // Nếu đã OPEN, giữ nguyên
    if (cbState.state === CircuitState.HALF_OPEN) {
      cbState.state = CircuitState.OPEN;
      this.logger.warn(
        `[CircuitBreaker] ${workflowId}: HALF_OPEN → OPEN ` +
        `(thử phục hồi thất bại lần ${cbState.halfOpenAttempts})`,
      );
    }
  }

  // ── Backoff Algorithm ──────────────────────────────────────────────────────

  /**
   * Tính thời gian delay cho Exponential Backoff có Jitter.
   *
   * Công thức:
   *   baseDelay = DEFAULT_BACKOFF_BASE_MS (1s)
   *   delay = min(baseDelay * 2^attempt, DEFAULT_BACKOFF_MAX_MS)
   *   jitter = delay * uniform(-JITTER_FACTOR, +JITTER_FACTOR)
   *   finalDelay = delay + jitter
   *
   * attempt bắt đầu từ 0.
   * Ví dụ: attempt=0 → 1000ms ±30%, attempt=1 → 2000ms ±30%, attempt=5 → 60000ms (capped) ±30%
   */
  private calculateBackoff(attempt: number): number {
    const delay = Math.min(
      DEFAULT_BACKOFF_BASE_MS * Math.pow(2, attempt),
      DEFAULT_BACKOFF_MAX_MS,
    );
    const jitter = delay * (Math.random() * 2 * JITTER_FACTOR - JITTER_FACTOR);
    return Math.round(delay + jitter);
  }

  // ── Error Classification ───────────────────────────────────────────────────

  /**
   * Xác định xem lỗi có đáng để retry hay không.
   *
   * Retry-able:
   *   - Lỗi mạng: ECONNRESET, ECONNREFUSED, ENOTFOUND, EPIPE, ETIMEDOUT
   *   - Lỗi timeout (HTTP 408, 504, AbortError)
   *   - Lỗi server 5xx (500, 502, 503)
   *   - Lỗi rate-limit 429
   *
   * Không retry:
   *   - Lỗi validation 4xx (trừ 408, 429)
   *   - Lỗi logic nghiệp vụ
   *   - SyntaxError, TypeError, ReferenceError (lỗi code)
   */
  private isRetryableError(err: any): boolean {
    if (!err) return false;

    const message = (err.message ?? '').toLowerCase();
    const code = err.code ?? '';
    const status = err.status ?? err.statusCode ?? 0;

    // Lỗi mạng
    if (['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code)) {
      return true;
    }

    // Lỗi fetch / AbortError
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return true;
    }

    // HTTP status codes
    if (status >= 500 && status < 600) return true;    // 5xx server error
    if (status === 408) return true;                    // Request Timeout
    if (status === 429) return true;                    // Too Many Requests

    // Lỗi message pattern
    if (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('network') ||
      message.includes('socket') ||
      message.includes('connection') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('service unavailable') ||
      message.includes('bad gateway')
    ) {
      return true;
    }

    return false;
  }

  // ── Database Persistence ───────────────────────────────────────────────────

  /**
   * Ghi nhận một lần retry thất bại vào database thông qua Prisma.
   * Cập nhật WorkflowExecution nếu có executionId, đồng thời ghi AuditLog.
   */
  private async recordRetryAttempt(
    tenantId: string,
    workflowId: string,
    executionId: string | undefined,
    attemptNumber: number,
    maxRetries: number,
    err: any,
  ): Promise<void> {
    try {
      if (executionId) {
        await this.prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            retryCount: attemptNumber,
            error: err.message?.substring(0, 500) ?? 'Unknown error',
          },
        });
      }

      // Ghi audit log cho mỗi lần retry
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          action: 'WORKFLOW_RETRY_ATTEMPT',
          entityType: 'WorkflowExecution',
          entityId: executionId ?? workflowId,
          metadata: {
            workflowId,
            executionId,
            attemptNumber,
            maxRetries,
            errorMessage: err.message?.substring(0, 1000),
            errorCode: err.code ?? null,
            errorName: err.name ?? null,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (dbErr) {
      // Không để lỗi DB ảnh hưởng đến luồng retry chính
      this.logger.error(
        `[RetryDB] Không thể ghi nhật ký retry cho ${workflowId}: ${(dbErr as Error).message}`,
      );
    }
  }

  /**
   * Ghi nhật ký lỗi cuối cùng (sau khi hết retry hoặc lỗi không retry được).
   * Lưu full Error Trace Object vào database.
   */
  private async persistErrorLog(
    tenantId: string,
    workflowId: string,
    err: any,
    executionId: string | undefined,
    exhausted: boolean,
    isCircuitBreaker: boolean = false,
  ): Promise<void> {
    try {
      const errorTrace: Record<string, any> = {
        workflowId,
        executionId,
        message: err.message,
        name: err.name,
        code: err.code ?? null,
        status: err.status ?? err.statusCode ?? null,
        stack: err.stack?.substring(0, 2000) ?? null,
        exhausted,
        isCircuitBreaker,
        timestamp: new Date().toISOString(),
      };

      if (err.cause) {
        errorTrace.cause = err.cause instanceof Error
          ? { message: err.cause.message, name: err.cause.name }
          : String(err.cause);
      }

      // Cập nhật execution nếu có
      if (executionId) {
        await this.prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            status: 'FAILED',
            error: err.message?.substring(0, 500) ?? 'Unknown error',
            completedAt: new Date(),
          },
        });
      }

      // AuditLog chi tiết
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          action: isCircuitBreaker
            ? 'WORKFLOW_CIRCUIT_BREAKER_OPEN'
            : exhausted
              ? 'WORKFLOW_RETRY_EXHAUSTED'
              : 'WORKFLOW_EXECUTION_ERROR',
          entityType: 'WorkflowExecution',
          entityId: executionId ?? workflowId,
          metadata: errorTrace as any,
        },
      });
    } catch (dbErr) {
      this.logger.error(
        `[ErrorLogDB] Không thể ghi error log cho ${workflowId}: ${(dbErr as Error).message}`,
      );
    }
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  /**
   * Tạm dừng thực thi trong `ms` miligiây.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ── Custom Error Classes ──────────────────────────────────────────────────────

/**
 * Lỗi ném ra khi Circuit Breaker đang OPEN và từ chối thực thi.
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Lỗi ném ra khi đã thử hết số lần retry cho phép.
 */
export class WorkflowRetryExhaustedError extends Error {
  public readonly cause: Error | undefined;

  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'WorkflowRetryExhaustedError';
    this.cause = originalError;
  }
}
