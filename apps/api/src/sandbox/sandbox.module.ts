// ===================================================================
// sandbox.module.ts — Sandbox Backend Module (NestJS 11)
// Mô-đun đóng gói toàn bộ phân hệ Developer Sandbox.
// Cung cấp môi trường thử nghiệm cô lập cho Connector, Workflow & AI.
//
// Phụ thuộc:
//   - TenancyModule → PrismaService (PostgreSQL) cho persistent state
//   - VirtualCostInterceptor → ghi nhận cost ảo cho telemetry
//   - SandboxExecutorService → quản lý môi trường thực thi cô lập
//   - SandboxBudgetService → cost simulation & budget tracking (Phase 4)
// ===================================================================

import { Module } from '@nestjs/common';
import { SandboxController } from './sandbox.controller';
import { SandboxService } from './sandbox.service';
import { SandboxExecutorService } from './sandbox-executor.service';
import { SandboxBudgetService } from './sandbox-budget.service';
import { SandboxTemplateService } from './sandbox-template.service';
import { VirtualCostInterceptor } from './interceptors/virtual-cost.interceptor';
import { TenancyModule } from '../tenancy.module';

/**
 * SandboxModule
 * ──────────────
 * Module điều phối Developer Sandbox Environment.
 *
 * Cấu trúc:
 * - imports:    TenancyModule → cung cấp PrismaService cho persistence
 * - controllers:SandboxController → REST routes (v1/sandbox)
 * - providers:  SandboxService (business logic)
 *               + SandboxExecutorService (trình thực thi cô lập)
 *               + SandboxBudgetService (cost simulation & budget)
 *               + VirtualCostInterceptor (ghi nhận cost ảo)
 * - exports:    SandboxService + SandboxExecutorService → cho phép module
 *               khác (vd: WorkflowsModule, ConnectorsModule) tái sử dụng
 *               không gian cô lập mà không inject lại
 */
@Module({
  imports: [TenancyModule],
  controllers: [SandboxController],
  providers: [
    SandboxService,
    SandboxExecutorService,
    SandboxBudgetService,
    SandboxTemplateService,
    VirtualCostInterceptor,
  ],
  exports: [SandboxService, SandboxExecutorService, SandboxBudgetService, SandboxTemplateService],
})
export class SandboxModule {}
