import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Put,
  Headers,
} from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import type {
  CreateSandboxInput,
  SetEnvInput,
  ExecuteConnectorInput,
  SandboxInstance,
  SandboxRunTrace,
} from './sandbox.service';

/**
 * Developer Sandbox Controller
 *
 * Provides HTTP endpoints for creating and managing isolated sandbox environments
 * where developers can test connector behaviors without production impact.
 *
 * All endpoints require a tenant-scoped context (via X-Tenant-Id header or query param).
 *
 * Base path: /sandbox
 */
@Controller('sandbox')
export class SandboxController {
  constructor(private readonly svc: SandboxService) {}

  /**
   * POST /sandbox
   * Create a new developer sandbox.
   */
  @Post()
  create(
    @Body() input: CreateSandboxInput,
    @Headers('X-Tenant-Id') tenantId?: string,
  ): SandboxInstance {
    const resolvedTenant = tenantId ?? input.tenantId;
    if (!resolvedTenant) {
      throw new Error('X-Tenant-Id header or tenantId in body is required');
    }
    return this.svc.createSandbox({ ...input, tenantId: resolvedTenant });
  }

  /**
   * GET /sandbox
   * List all active sandboxes for the current tenant.
   */
  @Get()
  list(@Headers('X-Tenant-Id') tenantId?: string): SandboxInstance[] {
    if (!tenantId) return [];
    return this.svc.listSandboxes(tenantId);
  }

  /**
   * GET /sandbox/:id
   * Get a specific sandbox by ID.
   */
  @Get(':id')
  get(
    @Param('id') id: string,
    @Headers('X-Tenant-Id') tenantId?: string,
  ): SandboxInstance {
    return this.svc.getSandbox(id, tenantId!);
  }

  /**
   * DELETE /sandbox/:id
   * Deactivate a sandbox.
   */
  @Delete(':id')
  delete(
    @Param('id') id: string,
    @Headers('X-Tenant-Id') tenantId?: string,
  ): { deleted: boolean } {
    return this.svc.deleteSandbox(id, tenantId!);
  }

  // ── Environment endpoints ─────────────────────────────────────────────────

  /**
   * GET /sandbox/:id/env
   * Get all environment variables for a sandbox.
   */
  @Get(':id/env')
  getEnv(
    @Param('id') id: string,
    @Headers('X-Tenant-Id') tenantId?: string,
  ): Record<string, string> {
    return this.svc.getSandboxEnv(id, tenantId!);
  }

  /**
   * PUT /sandbox/:id/env
   * Set or merge environment variables into a sandbox.
   *
   * Body:
   *   { "env": { "KEY": "VALUE" }, "mode": "merge" | "replace" }
   *
   * mode defaults to "merge" (adds/overwrites keys, keeps existing).
   * Use "replace" to reset the entire env (keeping only defaults).
   */
  @Put(':id/env')
  setEnv(
    @Param('id') id: string,
    @Body() input: SetEnvInput,
    @Headers('X-Tenant-Id') tenantId?: string,
  ): SandboxInstance {
    return this.svc.setSandboxEnv(id, tenantId!, input);
  }

  // ── Connector execution ───────────────────────────────────────────────────

  /**
   * POST /sandbox/:id/execute
   * Execute a connector action within the sandbox environment.
   *
   * This is a **simulated** execution with no real production side effects.
   * A full trace is recorded and can be retrieved via GET /sandbox/:id/traces/:runId
   *
   * Body:
   *   {
   *     "action": "ais.discovery" | "ais.action.invoke" | "ais.trigger.poll" | "ais.health.check",
   *     "payload": { ... },
   *     "baseUrl": "https://...",      // optional — if set, sandbox will attempt validation
   *     "method": "POST",              // optional, default POST
   *     "endpoint": "/api/resource",   // optional
   *     "headers": { "X-Custom": "value" },
   *     "timeoutMs": 30000
   *   }
   */
  @Post(':id/execute')
  async execute(
    @Param('id') id: string,
    @Body() input: ExecuteConnectorInput,
    @Headers('X-Tenant-Id') tenantId?: string,
  ): Promise<SandboxRunTrace> {
    return this.svc.executeConnector(id, tenantId!, input);
  }

  // ── Run traces ────────────────────────────────────────────────────────────

  /**
   * GET /sandbox/:id/traces
   * List all run traces for a sandbox (newest first).
   */
  @Get(':id/traces')
  listRunTraces(
    @Param('id') id: string,
    @Headers('X-Tenant-Id') tenantId?: string,
  ): SandboxRunTrace[] {
    return this.svc.listRunTraces(id, tenantId!);
  }

  /**
   * GET /sandbox/:id/traces/:runId
   * Get a specific run trace by run ID.
   */
  @Get(':id/traces/:runId')
  getRunTrace(
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Headers('X-Tenant-Id') tenantId?: string,
  ): SandboxRunTrace {
    return this.svc.getRunTrace(id, tenantId!, runId);
  }
}
