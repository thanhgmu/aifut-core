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
  Patch,
  Param,
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

const SESSION_NAME_MIN_LENGTH = 1;
const SESSION_NAME_MAX_LENGTH = 256;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const QUERY_INT_SAFE = 2_147_483_647;

// ── DTO Interfaces ────────────────────────────────────────────────────────

interface CreateSessionBody {
  name: string;
}

interface ExecuteSandboxBody {
  sessionId: string;
  action: string;
  input?: unknown;
}

// ── Exception Filter ──────────────────────────────────────────────────────

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
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object') {
      const { error, message } = response as { error?: unknown; message?: unknown };
      if (typeof error === 'string' && error.trim().length > 0) return error;
      if (typeof message === 'string' && message.trim().length > 0) return message;
      if (Array.isArray(message) && message.length > 0) return message.join('; ');
    }
    return exception.message;
  }
}

// ── Controller ────────────────────────────────────────────────────────────

@Controller('v1/sandbox')
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  // ── Create Session ──────────────────────────────────────────────────────

  @Post('sessions')
  async createSession(
    @Body() body: CreateSessionBody,
    @Headers('x-tenant-id') tenantId?: string,
  ): Promise<SandboxSessionResponse> {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header là bắt buộc');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Body không hợp lệ');
    }
    const name = body.name;
    if (!name || typeof name !== 'string') {
      throw new BadRequestException('"name" (string) là bắt buộc trong body');
    }
    const trimmedName = name.trim();
    if (trimmedName.length < SESSION_NAME_MIN_LENGTH) {
      throw new BadRequestException('Tên phiên sandbox không được để trống');
    }
    if (trimmedName.length > SESSION_NAME_MAX_LENGTH) {
      throw new BadRequestException(
        `Tên phiên không được vượt quá ${SESSION_NAME_MAX_LENGTH} ký tự`,
      );
    }
    return this.sandboxService.createSession(tenantId.trim(), trimmedName);
  }

  // ── List Sessions (with search + status filter) ─────────────────────────

  @Get('sessions')
  async listSessions(
    @Query('page') pageQuery?: string,
    @Query('pageSize') pageSizeQuery?: string,
    @Query('search') searchQuery?: string,
    @Query('statusFilter') statusFilterQuery?: string,
    @Headers('x-tenant-id') tenantId?: string,
  ): Promise<PaginatedSessionsResponse> {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header là bắt buộc');
    }
    const page = this.parsePositiveIntSafe(pageQuery, DEFAULT_PAGE);
    const pageSize = this.parsePositiveIntSafe(pageSizeQuery, DEFAULT_PAGE_SIZE);
    const search = typeof searchQuery === 'string' ? searchQuery.trim() : undefined;
    const statusFilter =
      statusFilterQuery === 'active' ? 'active' :
      statusFilterQuery === 'archived' ? 'archived' :
      undefined;
    return this.sandboxService.getTenantSessions(
      tenantId.trim(), page, pageSize, search, statusFilter,
    );
  }

  // ── Session Stats ───────────────────────────────────────────────────────

  @Get('sessions/:id/stats')
  async getSessionStats(
    @Param('id') sessionId: string,
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header là bắt buộc');
    }
    return this.sandboxService.getSessionStats(tenantId.trim(), sessionId);
  }

  // ── Pause / Resume / Archive ────────────────────────────────────────────

  @Patch('sessions/:id/pause')
  async pauseSession(
    @Param('id') sessionId: string,
    @Headers('x-tenant-id') tenantId?: string,
  ): Promise<SandboxSessionResponse> {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header là bắt buộc');
    }
    return this.sandboxService.updateSessionStatus(tenantId.trim(), sessionId, 'pause');
  }

  @Patch('sessions/:id/resume')
  async resumeSession(
    @Param('id') sessionId: string,
    @Headers('x-tenant-id') tenantId?: string,
  ): Promise<SandboxSessionResponse> {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header là bắt buộc');
    }
    return this.sandboxService.updateSessionStatus(tenantId.trim(), sessionId, 'resume');
  }

  @Patch('sessions/:id/archive')
  async archiveSession(
    @Param('id') sessionId: string,
    @Headers('x-tenant-id') tenantId?: string,
  ): Promise<SandboxSessionResponse> {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header là bắt buộc');
    }
    return this.sandboxService.updateSessionStatus(tenantId.trim(), sessionId, 'archive');
  }

  // ── Execute ─────────────────────────────────────────────────────────────

  @Post('execute')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @UseFilters(new SandboxExceptionFilter())
  async executeSandbox(
    @Body() body: ExecuteSandboxBody,
    @Headers('x-tenant-id') tenantId?: string,
  ): Promise<ExecuteSandboxResult> {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header là bắt buộc');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Body không hợp lệ');
    }
    const { sessionId, action, input } = body;
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      throw new BadRequestException('"sessionId" (string) là bắt buộc');
    }
    if (!action || typeof action !== 'string' || action.trim().length === 0) {
      throw new BadRequestException('"action" (string) là bắt buộc');
    }
    return this.sandboxService.executeSandboxIsolation(
      tenantId.trim(), sessionId.trim(), action.trim(), input ?? null,
    );
  }

  // ── Tenant Summary ────────────────────────────────────────────────────

  @Get('tenant/summary')
  async getTenantSummary(
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header là bắt buộc');
    }
    return this.sandboxService.getTenantSandboxSummary(tenantId.trim());
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  private parsePositiveIntSafe(
    value: string | undefined | null,
    defaultValue: number,
  ): number {
    if (value === undefined || value === null) return defaultValue;
    const trimmed = String(value).trim();
    if (trimmed.length === 0) return defaultValue;
    const parsed = Number(trimmed);
    if (
      !Number.isFinite(parsed) ||
      !Number.isInteger(parsed) ||
      parsed < 1 ||
      parsed > QUERY_INT_SAFE
    ) return defaultValue;
    return parsed;
  }
}
