// ===================================================================
// sandbox.controller.ts — Sandbox HTTP Controller v1 (DB-Backed)
// Bộ điều hướng REST cho Developer Sandbox Environment (API v1).
// Route gốc: /v1/sandbox
// Toàn bộ state được persist qua PrismaService (PostgreSQL).
// Tenant isolation qua X-Tenant-Id header — chống IDOR tuyệt đối.
// ===================================================================

import {
  ArgumentsHost,
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Query,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import type {
  SandboxSessionResponse,
  PaginatedSessionsResponse,
  ExecuteSandboxResult,
} from './sandbox.service';

// ── Validation Constants ───────────────────────────────────────────────────

/** Tối thiểu 1 ký tự cho tên phiên */
const SESSION_NAME_MIN_LENGTH = 1;

/** Tối đa 256 ký tự cho tên phiên */
const SESSION_NAME_MAX_LENGTH = 256;

/** Mặc định số trang khi không có query */
const DEFAULT_PAGE = 1;

/** Mặc định số bản ghi mỗi trang */
const DEFAULT_PAGE_SIZE = 20;

/** Giới hạn chống tấn công integer overflow */
const QUERY_INT_SAFE = 2_147_483_647;

// ── DTO Interfaces (Inline — tránh tách file để giữ tập trung) ────────────

interface CreateSessionBody {
  /** Tên gợi nhớ cho phiên sandbox */
  name: string;
}

interface ExecuteSandboxBody {
  /** ID phiên sandbox cần thực thi */
  sessionId: string;

  /** Loại hành động thử nghiệm */
  action: string;

  /** Payload đầu vào (tuỳ chọn) */
  input?: unknown;
}

// ── Controller ─────────────────────────────────────────────────────────────

/**
 * SandboxController
 * ──────────────────
 * Điều hướng các request liên quan đến môi trường thử nghiệm cô lập
 * (Developer Sandbox). Route prefix: /v1/sandbox
 *
 * Nguyên tắc bảo mật:
 * - TenantId LUÔN được trích xuất từ header `x-tenant-id` (chữ thường)
 * - Không bao giờ đọc tenantId từ body request → chống IDOR tuyệt đối
 * - Phân trang cứng (clamp 1–100) để chống quét dữ liệu
 */
@Catch()
class SandboxExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest<{ originalUrl?: string; url?: string }>();
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const error =
      exception instanceof HttpException
        ? this.resolveHttpExceptionError(exception)
        : 'Internal server error';

    response.status(statusCode).json({
      success: false,
      statusCode,
      error,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url ?? '',
    });
  }

  private resolveHttpExceptionError(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (response && typeof response === 'object') {
      const { error, message } = response as {
        error?: unknown;
        message?: unknown;
      };

      if (typeof error === 'string' && error.trim().length > 0) {
        return error;
      }

      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }

      if (Array.isArray(message) && message.length > 0) {
        return message.join('; ');
      }
    }

    return exception.message;
  }
}

@Controller('v1/sandbox')
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  /**
   * POST /v1/sandbox/sessions
   * ───────────────────────────
   * Khởi tạo một phiên sandbox mới cho tenant hiện tại.
   *
   * TenantId được trích xuất AN TOÀN từ header x-tenant-id (chữ thường)
   * — không tin tưởng body request để phòng chống IDOR (nếu tenant trong
   * body khác header, header luôn là nguồn thật).
   *
   * Request body:
   * ```json
   * { "name": "Test luồng thanh toán VNPay" }
   * ```
   *
   * @throws 400 — nếu thiếu hoặc sai tenantId / name
   * @throws 404 — nếu tenant không tồn tại trong DB
   */
  @Post('sessions')
  async createSession(
    @Body() body: CreateSessionBody,
    @Headers('x-tenant-id') tenantId?: string,
  ): Promise<SandboxSessionResponse> {
    // ── Validate tenant context ─────────────────────────────────────
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException(
        'x-tenant-id header là bắt buộc và không được để trống — ' +
        'vui lòng gửi header x-tenant-id với UUID của tenant',
      );
    }

    // ── Validate input ──────────────────────────────────────────────
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Body request không hợp lệ — phải là JSON object');
    }

    const name = body.name;
    if (!name || typeof name !== 'string') {
      throw new BadRequestException(
        '"name" (string) là bắt buộc trong body — tên gợi nhớ cho phiên sandbox',
      );
    }

    const trimmedName = name.trim();
    if (trimmedName.length < SESSION_NAME_MIN_LENGTH) {
      throw new BadRequestException('Tên phiên sandbox không được để trống');
    }
    if (trimmedName.length > SESSION_NAME_MAX_LENGTH) {
      throw new BadRequestException(
        `Tên phiên sandbox không được vượt quá ${SESSION_NAME_MAX_LENGTH} ký tự`,
      );
    }

    // ── Delegate to service layer ───────────────────────────────────
    return this.sandboxService.createSession(tenantId.trim(), trimmedName);
  }

  /**
   * GET /v1/sandbox/sessions
   * ──────────────────────────
   * Tra cứu danh sách phiên sandbox của tenant hiện tại với phân trang.
   *
   * Query params:
   * - page     (number, mặc định 1)  — trang hiện tại (≥ 1)
   * - pageSize (number, mặc định 20) — số bản ghi mỗi trang (clamp 1–100)
   *
   * Ép kiểu số nguyên an toàn — mọi giá trị không phải số nguyên dương
   * đều được fallback về mặc định.
   *
   * @throws 400 — nếu thiếu x-tenant-id header
   */
  @Get('sessions')
  async listSessions(
    @Query('page') pageQuery?: string,
    @Query('pageSize') pageSizeQuery?: string,
    @Headers('x-tenant-id') tenantId?: string,
  ): Promise<PaginatedSessionsResponse> {
    // ── Validate tenant context ─────────────────────────────────────
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException(
        'x-tenant-id header là bắt buộc và không được để trống',
      );
    }

    // ── Parse & sanitize pagination params ──────────────────────────
    const page = this.parsePositiveIntSafe(pageQuery, DEFAULT_PAGE);
    const pageSize = this.parsePositiveIntSafe(pageSizeQuery, DEFAULT_PAGE_SIZE);

    // ── Delegate to service ─────────────────────────────────────────
    return this.sandboxService.getTenantSessions(
      tenantId.trim(),
      page,
      pageSize,
    );
  }

  /**
   * POST /v1/sandbox/execute
   * ──────────────────────────
   * Thực thi một hành động thử nghiệm trong phiên sandbox được chỉ định.
   * Hành động này luôn chạy trong chế độ cô lập (isolated) — không tác
   * động đến dữ liệu production. Toàn bộ trace được ghi nhận vào DB.
   *
   * Request body:
   * ```json
   * {
   *   "sessionId": "cm8x...",
   *   "action": "AI_ROUTING",
   *   "input": { "query": "test prompt" }
   * }
   * ```
   *
   * @throws 400 — nếu thiếu tenantId, sessionId hoặc action
   * @throws 404 — nếu session không tồn tại hoặc không thuộc tenant
  */
  @Post('execute')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @UseFilters(new SandboxExceptionFilter())
  async executeSandbox(
    @Body() body: ExecuteSandboxBody,
    @Headers('x-tenant-id') tenantId?: string,
  ): Promise<ExecuteSandboxResult> {
    // ── Validate tenant context ─────────────────────────────────────
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException(
        'x-tenant-id header là bắt buộc và không được để trống — ' +
        'phải có header x-tenant-id với UUID của tenant',
      );
    }

    // ── Validate body ───────────────────────────────────────────────
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Body request không hợp lệ — phải là JSON object');
    }

    const { sessionId, action, input } = body;

    // Validate sessionId
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      throw new BadRequestException(
        '"sessionId" (string) là bắt buộc trong body — ' +
        'ID của phiên sandbox cần thực thi',
      );
    }

    // Validate action
    if (!action || typeof action !== 'string' || action.trim().length === 0) {
      throw new BadRequestException(
        '"action" (string) là bắt buộc trong body — ' +
        'loại hành động thử nghiệm (VD: AI_ROUTING, CONNECTOR_EXEC, WORKFLOW_RUN)',
      );
    }

    // ── Delegate to service ─────────────────────────────────────────
    return this.sandboxService.executeSandboxIsolation(
      tenantId.trim(),
      sessionId.trim(),
      action.trim(),
      input ?? null,
    );
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  /**
   * parsePositiveIntSafe
   * ─────────────────────
   * Ép kiểu an toàn từ query string → số nguyên dương.
   * Fallback về defaultValue nếu:
   * - Không phải số hợp lệ (NaN, Infinity, ...)
   * - Nhỏ hơn 1
   * - Vượt quá QUERY_INT_SAFE (chống integer overflow)
   * - value là undefined/null
   *
   * @param value          — Raw query string
   * @param defaultValue   — Giá trị mặc định khi không parse được
   * @returns number — Số nguyên dương an toàn
   */
  private parsePositiveIntSafe(
    value: string | undefined | null,
    defaultValue: number,
  ): number {
    // null/undefined → fallback
    if (value === undefined || value === null) {
      return defaultValue;
    }

    const trimmed = String(value).trim();

    // String rỗng → fallback
    if (trimmed.length === 0) {
      return defaultValue;
    }

    const parsed = Number(trimmed);

    // Kiểm tra: NaN, ±Infinity, không phải integer, < 1, > safe limit
    if (
      !Number.isFinite(parsed) ||
      !Number.isInteger(parsed) ||
      parsed < 1 ||
      parsed > QUERY_INT_SAFE
    ) {
      return defaultValue;
    }

    return parsed;
  }
}
