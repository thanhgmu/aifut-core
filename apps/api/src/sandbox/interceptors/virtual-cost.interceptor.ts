import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Request } from 'express';
import { randomUUID } from 'crypto';

/**
 * Định nghĩa cấu trúc chi phí ảo.
 */
export interface VirtualCostEstimate {
  /** Số tiền ảo dạng BigInt để tránh mất precision (đơn vị nhỏ nhất, vd: cents) */
  estimatedCost: bigint;
  /** Chuỗi biểu diễn chi phí với đơn vị người dùng (vd: "0.25 USD") */
  displayCost: string;
  /** Loại hành động được giả lập */
  actionType: string;
  /** ID dấu vết để đối chiếu */
  traceId: string;
}

/**
 * Payload sạch đẩy sang SandboxTrace cho viễn trắc.
 */
export interface SandboxTraceRecord {
  traceId: string;
  sandboxSessionId: string;
  actionType: string;
  estimatedCost: string;        // bigint serialised as string
  inputSummary: string;
  outputSummary: string;
  latencyMs: number;
  success: boolean;
  timestamp: string;            // ISO-8601
  metadata?: Record<string, unknown>;
}

/**
 * Cấu hình mặc định cho các loại hành động sandbox.
 */
const ACTION_COST_TABLE: Record<string, { baseCost: bigint; unit: string }> = {
  'workflow.execute':       { baseCost: 500n,   unit: 'credits' },
  'ai.completion':          { baseCost: 100n,   unit: 'tokens' },
  'connector.sync':         { baseCost: 200n,   unit: 'credits' },
  'storage.upload':         { baseCost: 50n,    unit: 'MB' },
  'analytics.query':        { baseCost: 300n,   unit: 'credits' },
  'notification.send':      { baseCost: 10n,    unit: 'messages' },
  'auth.verify':            { baseCost: 5n,     unit: 'requests' },
  'marketplace.publish':    { baseCost: 1000n,  unit: 'credits' },
  'reseller.transfer':      { baseCost: 250n,   unit: 'credits' },
  'default':                { baseCost: 100n,   unit: 'credits' },
};

/**
 * VirtualCostInterceptor
 *
 * NestJS interceptor đánh chặn mọi request khi flag `x-aifut-sandbox` được bật
 * trong HTTP header (value = 'true').
 *
 * Khi ở chế độ sandbox, interceptor sẽ:
 *   1. Phát hiện request metadata → header `x-aifut-sandbox`.
 *   2. Từ chối thực thi các tác vụ Ledger thật, thay vào đó ước tính chi phí ảo
 *      dựa trên action type và kích thước payload.
 *   3. Chặn output stream (RxJS map), biên dịch trace log, đẩy sang SandboxTrace.
 *   4. Trả về response đã được bọc với VirtualCostEstimate.
 *
 * Sử dụng Node.js native `crypto.randomUUID()` thay vì thư viện uuid
 * để tránh lỗi type declarations.
 */
@Injectable()
export class VirtualCostInterceptor implements NestInterceptor {
  private readonly logger = new Logger(VirtualCostInterceptor.name);

  /**
   * Ước tính chi phí ảo dựa trên action type và độ phức tạp của request.
   */
  private estimateCost(
    actionType: string,
    bodySize: number,
  ): { estimatedCost: bigint; displayCost: string } {
    const rule = ACTION_COST_TABLE[actionType] ?? ACTION_COST_TABLE['default'];
    // Nhân baseCost với kích thước body (bytes) / 1024 để mô phỏng scaling,
    // tối thiểu 1 để tránh cost = 0.
    const multiplier = Math.max(1, Math.ceil(bodySize / 1024));
    const estimatedCost = rule.baseCost * BigInt(multiplier);
    const displayCost = `${estimatedCost.toString()} ${rule.unit}`;
    return { estimatedCost, displayCost };
  }

  /**
   * Rút trích action type từ request path / method.
   */
  private resolveActionType(request: Request): string {
    const method = request.method?.toLowerCase() ?? 'get';
    const path   = (request.path ?? request.url ?? '').replace(/^\/+/, '');
    // Ưu tiên header nếu client tự khai báo
    const explicitType = (request.headers as Record<string, string>)?.['x-action-type'];
    if (explicitType) return explicitType;

    // Suy luận từ path pattern
    if (/^(api\/)?workflow/i.test(path))       return 'workflow.execute';
    if (/^(api\/)?ai/i.test(path) || /^(api\/)?llm/i.test(path)) return 'ai.completion';
    if (/^(api\/)?connector/i.test(path))       return 'connector.sync';
    if (/^(api\/)?storage/i.test(path))         return 'storage.upload';
    if (/^(api\/)?analytics/i.test(path))       return 'analytics.query';
    if (/^(api\/)?notification/i.test(path))    return 'notification.send';
    if (/^(api\/)?(auth|verify)/i.test(path))   return 'auth.verify';
    if (/^(api\/)?marketplace/i.test(path))     return 'marketplace.publish';
    if (/^(api\/)?reseller/i.test(path))        return 'reseller.transfer';
    return 'default';
  }

  /**
   * Tóm tắt input payload dạng text ngắn.
   */
  private summarizeInput(body: unknown): string {
    try {
      const json = JSON.stringify(body);
      if (json.length <= 200) return json;
      return json.slice(0, 200) + '…';
    } catch {
      return String(body ?? '').slice(0, 200);
    }
  }

  /**
   * Tóm tắt output payload dạng text ngắn.
   */
  private summarizeOutput(data: unknown): string {
    try {
      const json = JSON.stringify(data);
      if (json.length <= 400) return json;
      return json.slice(0, 400) + '…';
    } catch {
      return String(data ?? '').slice(0, 400);
    }
  }

  /**
   * Tạo một bản ghi SandboxTraceRecord hoàn chỉnh.
   */
  private buildTraceRecord(
    traceId: string,
    sandboxSessionId: string,
    actionType: string,
    estimatedCost: bigint,
    inputSummary: string,
    outputSummary: string,
    latencyMs: number,
    success: boolean,
    metadata?: Record<string, unknown>,
  ): SandboxTraceRecord {
    return {
      traceId,
      sandboxSessionId,
      actionType,
      estimatedCost: estimatedCost.toString(),
      inputSummary,
      outputSummary,
      latencyMs,
      success,
      timestamp: new Date().toISOString(),
      metadata: metadata ?? {},
    };
  }

  /**
   * Ghi trace vào logger (trong tương lai có thể đẩy sang SandboxService
   * hoặc queue để persist vào database).
   */
  private persistTrace(record: SandboxTraceRecord): void {
    // Ghi log ở cấp verbose để debug sandbox
    this.logger.log(
      `[SANDBOX TRACE] ${record.traceId} | ` +
      `action=${record.actionType} | ` +
      `cost=${record.estimatedCost} | ` +
      `latency=${record.latencyMs}ms | ` +
      `success=${record.success}`,
    );
    // TODO: đẩy record vào SandboxService.createTrace() hoặc hàng đợi
    // để lưu vào DB sandbox_traces (dành cho viễn trắc sau này).
  }

  /**
   * Phương thức chính của interceptor.
   *
   * Phát hiện sandbox mode qua header `x-aifut-sandbox === 'true'`.
   * Không ép kiểu phức tạp — so sánh chuỗi trực tiếp an toàn.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request: Request = context.switchToHttp().getRequest();

    // ── Phát hiện chế độ sandbox từ header ────────────────────────────
    // Ép kiểu an toàn: nếu request, headers hoặc giá trị undefined → false
    const isSandboxMode =
      request &&
      request.headers &&
      request.headers['x-aifut-sandbox'] === 'true';

    // ── Chế độ thường: không can thiệp ──────────────────────────────────
    if (!isSandboxMode) {
      return next.handle();
    }

    // ── Chế độ Sandbox: bẻ lái toàn bộ ─────────────────────────────────
    const startTime = Date.now();
    const traceId = randomUUID();
    // Truy cập thuộc tính động an toàn — không ép kiểu Record<string, unknown> phức tạp
    const sandboxSessionId = (request as any)['sandboxSessionId'] || 'sandbox-default';
    const actionType = this.resolveActionType(request);
    const body = request.body ?? {};
    const bodySize = Buffer.byteLength(JSON.stringify(body), 'utf8');

    this.logger.log(
      `[SANDBOX] Intercepting request ${request.method} ${request.url} ` +
      `→ action=${actionType}, bodySize=${bodySize}B`,
    );

    // 1. Ước tính chi phí ảo
    const { estimatedCost, displayCost } = this.estimateCost(actionType, bodySize);

    // 2. Thay vì gọi real handler, ta cho pipeline chạy để lấy response thật
    //    nhưng sẽ chặn output bằng map để inject cost estimate.
    return next.handle().pipe(
      // ── Chặn output stream ──────────────────────────────────────────
      map((responseData: unknown) => {
        const latencyMs = Date.now() - startTime;
        const outputSummary = this.summarizeOutput(responseData);

        // Biên dịch trace record
        const traceRecord = this.buildTraceRecord(
          traceId,
          sandboxSessionId,
          actionType,
          estimatedCost,
          this.summarizeInput(body),
          outputSummary,
          latencyMs,
          true, // success
          { originalStatus: context.switchToHttp().getResponse().statusCode },
        );
        this.persistTrace(traceRecord);

        // Bọc response để client sandbox biết chi phí ảo
        return {
          sandbox: true,
          virtualCost: {
            traceId,
            estimatedCost: estimatedCost.toString(),
            displayCost,
            actionType,
          },
          data: responseData,
        };
      }),

      // ── Xử lý lỗi ───────────────────────────────────────────────────
      catchError((error: Error) => {
        const latencyMs = Date.now() - startTime;
        const traceRecord = this.buildTraceRecord(
          traceId,
          sandboxSessionId,
          actionType,
          estimatedCost,
          this.summarizeInput(body),
          `Error: ${error.message}`,
          latencyMs,
          false, // success
          { errorName: error.name, errorStack: error.stack?.slice(0, 300) },
        );
        this.persistTrace(traceRecord);

        // Trả về response lỗi nhưng vẫn kèm virtual cost info
        return of({
          sandbox: true,
          virtualCost: {
            traceId,
            estimatedCost: estimatedCost.toString(),
            displayCost,
            actionType,
          },
          error: {
            message: error.message,
            name: error.name,
          },
        });
      }),
    );
  }
}
