// ===================================================================
// sandbox.service.ts — Sandbox Database Service (DB-Backed)
// Dịch vụ điều phối lõi cho Developer Sandbox Environment.
// Sử dụng PrismaService (PostgreSQL) để lưu SandboxSession + SandboxTrace
// với phân trang cứng chống IDOR và telemetry tự động.
// ===================================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

// ── Pagination constants ──────────────────────────────────────────────────

const HARD_PAGE_LIMIT = 100;
const HARD_PAGE_MIN = 1;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_VIRTUAL_COST = 1_000n;

// ── Session action types ──────────────────────────────────────────────────

type SessionAction = 'pause' | 'resume' | 'archive';


// ── Public types ──────────────────────────────────────────────────────────

export interface SandboxSessionResponse {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  traceCount: number;
}

export interface SandboxTraceResponse {
  id: string;
  sessionId: string;
  actionType: string;
  inputPayload: unknown;
  outputPayload: unknown;
  latencyMs: number;
  isSuccess: boolean;
  errorMessage?: string;
  virtualCostBigInt: string; // BigInt serialized as string for JSON safety
  createdAt: Date;
}

export interface PaginatedSessionsResponse {
  data: SandboxSessionResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ExecuteSandboxResult {
  trace: SandboxTraceResponse;
  session: SandboxSessionResponse;
}

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()

export class SandboxService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * createSession
   * ──────────────
   * Khởi tạo một phiên sandbox mới dưới trạng thái isActive: true.
   * Tenant scoped — session chỉ thuộc về một tenant duy nhất.
   *
   * @param tenantId - UUID của tenant sở hữu
   * @param name     - Tên gợi nhớ cho phiên sandbox
   * @returns SandboxSessionResponse — phiên vừa được tạo
   */
  /**
   * updateSessionStatus
   * ────────────────────
   * Pause, Resumé, hoặc Archive một phiên sandbox.
   * pause → isActive=false, resume → isActive=true
   */
  async updateSessionStatus(
    tenantId: string,
    sessionId: string,
    action: SessionAction,
  ): Promise<SandboxSessionResponse> {
    const session = await this.prisma.sandboxSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException(`SandboxSession '${sessionId}' không tồn tại`);
    }
    if (session.tenantId !== tenantId) {
      throw new NotFoundException(`SandboxSession '${sessionId}' không thuộc tenant`);
    }

    let isActive: boolean;
    switch (action) {
      case 'pause':
        if (!session.isActive) {
          throw new BadRequestException('Session đã ở trạng thái paused.');
        }
        isActive = false;
        break;
      case 'resume':
        if (session.isActive) {
          throw new BadRequestException('Session đã ở trạng thái active.');
        }
        isActive = true;
        break;
      case 'archive':
        isActive = false;
        break;
    }

    const updated = await this.prisma.sandboxSession.update({
      where: { id: sessionId },
      data: { isActive },
    });

    const traceCount = await this.prisma.sandboxTrace.count({
      where: { sessionId },
    });

    return this.toSessionResponse(updated, traceCount);
  }

  /**
   * getSessionStats
   * ───────────────
   * Thống kê cho một session: tổng traces, success rate, tổng cost, latency avg.
   */
  async getSessionStats(tenantId: string, sessionId: string) {
    const session = await this.prisma.sandboxSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Session không tồn tại.');
    }
    if (session.tenantId !== tenantId) {
      throw new NotFoundException('Session không thuộc tenant.');
    }

    const traces = await this.prisma.sandboxTrace.findMany({
      where: { sessionId },
    });

    const totalExecutions = traces.length;
    const successCount = traces.filter((t) => t.isSuccess).length;
    const failCount = totalExecutions - successCount;
    const successRate =
      totalExecutions > 0 ? (successCount / totalExecutions) * 100 : 0;

    const totalCost = traces.reduce(
      (sum, t) => sum + t.virtualCostBigInt,
      BigInt(0),
    );
    const totalLatencyMs = traces.reduce((sum, t) => sum + t.latencyMs, 0);
    const avgLatencyMs =
      totalExecutions > 0
        ? Math.round(totalLatencyMs / totalExecutions)
        : 0;

    // Group by action type
    const actionBreakdown: Record<string, number> = {};
    for (const t of traces) {
      actionBreakdown[t.actionType] =
        (actionBreakdown[t.actionType] ?? 0) + 1;
    }

    return {
      sessionId,
      sessionName: session.name,
      isActive: session.isActive,
      totalExecutions,
      successCount,
      failCount,
      successRate: Math.round(successRate * 100) / 100,
      totalVirtualCost: totalCost.toString(),
      avgLatencyMs,
      actionBreakdown,
      createdAt: session.createdAt,
    };
  }

  /**
   * getTenantSandboxSummary
   * ──────────────────────
   * Tổng quan tất cả sandbox của tenant.
   */
  async getTenantSandboxSummary(tenantId: string) {
    const sessions = await this.prisma.sandboxSession.findMany({
      where: { tenantId },
    });

    const sessionIds = sessions.map((s) => s.id);
    const allTraces = await this.prisma.sandboxTrace.findMany({
      where: { sessionId: { in: sessionIds } },
    });

    const totalSessions = sessions.length;
    const activeSessions = sessions.filter((s) => s.isActive).length;
    const totalExecutions = allTraces.length;
    const totalSuccess = allTraces.filter((t) => t.isSuccess).length;
    const totalCost = allTraces.reduce(
      (sum, t) => sum + t.virtualCostBigInt,
      BigInt(0),
    );

    return {
      totalSessions,
      activeSessions,
      archivedSessions: totalSessions - activeSessions,
      totalExecutions,
      successRate:
        totalExecutions > 0
          ? Math.round((totalSuccess / totalExecutions) * 10000) / 100
          : 0,
      totalVirtualCost: totalCost.toString(),
      lastExecution:
        allTraces.length > 0
          ? allTraces.sort(
              (a, b) =>
                b.createdAt.getTime() - a.createdAt.getTime(),
            )[0].createdAt
          : null,
    };
  }

  async createSession(
    // ── Validate ─────────────────────────────────────────────────────
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('tenantId không được để trống');
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new BadRequestException('name không được để trống');
    }
    if (name.length > 256) {
      throw new BadRequestException('name không được vượt quá 256 ký tự');
    }

    // ── Kiểm tra tenant tồn tại ──────────────────────────────────────
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant '${tenantId}' không tồn tại`);
    }

    // ── Tạo session mới ──────────────────────────────────────────────
    const session = await this.prisma.sandboxSession.create({
      data: {
        tenantId,
        name: name.trim(),
        isActive: true,
      },
    });

    return this.toSessionResponse(session, 0);
  }

  /**
   * executeSandboxIsolation
   * ────────────────────────
   * Trích xuất phiên thử nghiệm, bọc logic xử lý chạy thử,
   * tự động tính toán thời gian phản hồi (telemetry latencyMs)
   * và tạo bản ghi SandboxTrace với inputPayload, outputPayload
   * cùng virtualCostBigInt dạng BigInt.
   *
   * @param tenantId  - Tenant sở hữu session
   * @param sessionId - ID phiên sandbox cần thực thi
   * @param action    - Loại hành động (VD: 'AI_ROUTING' | 'CONNECTOR_EXEC' | 'WORKFLOW_RUN')
   * @param input     - Payload đầu vào
   * @returns ExecuteSandboxResult — trace + session snapshot
   */
  async executeSandboxIsolation(
    tenantId: string,
    sessionId: string,
    action: string,
    input: unknown,
  ): Promise<ExecuteSandboxResult> {
    // ── Validate ─────────────────────────────────────────────────────
    if (!sessionId || typeof sessionId !== 'string') {
      throw new BadRequestException('sessionId không hợp lệ');
    }
    if (!action || typeof action !== 'string' || action.trim().length === 0) {
      throw new BadRequestException('action không được để trống');
    }

    // ── Kiểm tra session tồn tại và thuộc tenant ─────────────────────
    const session = await this.prisma.sandboxSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(
        `SandboxSession '${sessionId}' không tồn tại`,
      );
    }

    // Chống IDOR: kiểm tra quyền sở hữu tenant
    if (session.tenantId !== tenantId) {
      throw new NotFoundException(
        `SandboxSession '${sessionId}' không thuộc tenant hiện tại`,
      );
    }

    if (!session.isActive) {
      throw new BadRequestException(
        `SandboxSession '${sessionId}' đã bị vô hiệu hoá`,
      );
    }

    // ── Xử lý giả lập ───────────────────────────────────────────────
    // Tính thời gian phản hồi (telemetry)
    const startTime = Date.now();

    // Mô phỏng xử lý: delay ngẫu nhiên 10-100ms
    const simulatedDelay = 10 + Math.floor(Math.random() * 90);
    await new Promise((resolve) => setTimeout(resolve, simulatedDelay));

    // Sinh outputPayload dựa trên action
    const outputPayload = this.simulateActionOutput(action, input, sessionId);

    // Tính toán virtualCost dựa trên độ phức tạp của action
    const virtualCostBigInt = this.computeVirtualCost(action, simulatedDelay);

    // Telemetry: latencyMs chính xác
    const latencyMs = Date.now() - startTime;

    const isSuccess = true;
    const errorMessage: string | undefined = undefined;

    // ── Lưu vết trace vào DB ────────────────────────────────────────
    const trace = await this.prisma.sandboxTrace.create({
      data: {
        sessionId,
        actionType: action.trim(),
        inputPayload: input as Prisma.InputJsonValue ?? Prisma.JsonNull,
        outputPayload: outputPayload as Prisma.InputJsonValue ?? Prisma.JsonNull,
        isMocked: true,
        latencyMs,
        isSuccess,
        errorMessage,
        virtualCostBigInt,
      },
    });

    // ── Đếm trace count cho session response ────────────────────────
    const traceCount = await this.prisma.sandboxTrace.count({
      where: { sessionId },
    });

    return {
      trace: this.toTraceResponse(trace),
      session: this.toSessionResponse(session, traceCount),
    };
  }

  /**
   * getTenantSessions
   * ─────────────────
   * Tra cứu toàn bộ danh sách phiên của một tenant có phân trang cứng
   * để bảo mật tuyệt đối chống IDOR (không cho phép vượt quá hard limit).
   *
   * @param tenantId - Tenant sở hữu các session
   * @param page     - Trang hiện tại (bắt đầu từ 1)
   * @param pageSize - Số bản ghi mỗi trang (clamped 1-100)
   * @returns PaginatedSessionsResponse
   */
  async getTenantSessions(
    tenantId: string,
    page: number = 1,
    pageSize: number = DEFAULT_PAGE_SIZE,
    search?: string,
    statusFilter?: 'active' | 'archived',
  ): Promise<PaginatedSessionsResponse> {
    // ── Build where clause ───────────────────────────────────────────
    const where: any = { tenantId };
    if (search && search.trim().length > 0) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }
    if (statusFilter === 'active') {
      where.isActive = true;
    } else if (statusFilter === 'archived') {
      where.isActive = false;
    }

    // ── Clamp phân trang cứng ───────────────────────────────────────
    const safePage = Math.max(HARD_PAGE_MIN, Math.floor(page));
    const safePageSize = Math.min(
      HARD_PAGE_LIMIT,
      Math.max(HARD_PAGE_MIN, Math.floor(pageSize)),
    );
    const skip = (safePage - 1) * safePageSize;

    // ── Count total ─────────────────────────────────────────────────
    const total = await this.prisma.sandboxSession.count({ where });

    // ── Query phân trang (sắp xếp mới nhất lên đầu) ────────────────
    const sessions = await this.prisma.sandboxSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: safePageSize,
    });

    // ── Lấy traceCount cho mỗi session ──────────────────────────────
    const sessionIds = sessions.map((s) => s.id);
    const traceCounts = await this.getTraceCounts(sessionIds);
    const traceCountMap = new Map(traceCounts.map((t) => [t.sessionId, t.count]));

    const data = sessions.map((s) =>
      this.toSessionResponse(s, traceCountMap.get(s.id) ?? 0),
    );

    return {
      data,
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize) || 1,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * toSessionResponse — map Prisma model → public response type
   */
  private toSessionResponse(
    session: {
      id: string;
      tenantId: string;
      name: string;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
    traceCount: number,
  ): SandboxSessionResponse {
    return {
      id: session.id,
      tenantId: session.tenantId,
      name: session.name,
      isActive: session.isActive,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      traceCount,
    };
  }

  /**
   * toTraceResponse — map Prisma model → public response type
   * virtualCostBigInt được convert qua BigInt → string để an toàn JSON
   */
  private toTraceResponse(trace: {
    id: string;
    sessionId: string;
    actionType: string;
    inputPayload: unknown;
    outputPayload: unknown;
    latencyMs: number;
    isSuccess: boolean;
    errorMessage: string | null;
    virtualCostBigInt: bigint;
    createdAt: Date;
  }): SandboxTraceResponse {
    return {
      id: trace.id,
      sessionId: trace.sessionId,
      actionType: trace.actionType,
      inputPayload: trace.inputPayload,
      outputPayload: trace.outputPayload,
      latencyMs: trace.latencyMs,
      isSuccess: trace.isSuccess,
      errorMessage: trace.errorMessage ?? undefined,
      virtualCostBigInt: trace.virtualCostBigInt.toString(),
      createdAt: trace.createdAt,
    };
  }

  /**
   * getTraceCounts — batch count traces per session
   */
  private async getTraceCounts(
    sessionIds: string[],
  ): Promise<{ sessionId: string; count: number }[]> {
    if (sessionIds.length === 0) return [];

    // Execute parallel count queries grouped by sessionId
    const results = await Promise.all(
      sessionIds.map((sid) =>
        this.prisma.sandboxTrace
          .count({ where: { sessionId: sid } })
          .then((count) => ({ sessionId: sid, count })),
      ),
    );

    return results;
  }

  /**
   * simulateActionOutput — sinh outputPayload giả lập dựa trên action type
   */
  private simulateActionOutput(
    action: string,
    input: unknown,
    sessionId: string,
  ): Record<string, unknown> {
    const timestamp = new Date().toISOString();

    switch (action.toUpperCase()) {
      case 'AI_ROUTING':
        return {
          status: 'simulated',
          selectedLane: 'balanced',
          estimatedTokens: 1024,
          model: 'gpt-4o-sandbox',
          confidence: 0.92,
          sessionId,
          timestamp,
        };

      case 'CONNECTOR_EXEC':
        return {
          status: 'simulated',
          action: 'connector.execute',
          recordsAffected: 0,
          duration: '0ms',
          sessionId,
          inputKeys: Array.isArray(input)
            ? input.length
            : typeof input === 'object' && input !== null
              ? Object.keys(input as Record<string, unknown>).length
              : 0,
          timestamp,
        };

      case 'WORKFLOW_RUN':
        return {
          status: 'simulated',
          workflow: 'dry-run',
          stepsExecuted: 3,
          stepsSkipped: 0,
          totalDuration: '0ms',
          sessionId,
          timestamp,
        };

      default:
        return {
          status: 'simulated',
          action: action,
          sessionId,
          message: 'Unknown action executed in passthrough mode',
          timestamp,
        };
    }
  }

  /**
   * computeVirtualCost — sinh chi phí ảo BigInt dựa trên action + độ trễ
   */
  private computeVirtualCost(action: string, latencyMs: number): bigint {
    // Action weight: AI_ROUTING đắt nhất, CONNECTOR_EXEC vừa, WORKFLOW_RUN rẻ
    let baseWeight = 1_000n; // Mặc định

    switch (action.toUpperCase()) {
      case 'AI_ROUTING':
        baseWeight = 3_000n;
        break;
      case 'CONNECTOR_EXEC':
        baseWeight = 1_500n;
        break;
      case 'WORKFLOW_RUN':
        baseWeight = 2_000n;
        break;
    }

    // bonus theo latency (ms → VND)
    const latencyBonus = BigInt(latencyMs) * 10n;
    const totalCost = DEFAULT_VIRTUAL_COST + baseWeight + latencyBonus;

    return totalCost;
  }
}
