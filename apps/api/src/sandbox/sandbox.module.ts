// ===================================================================
// sandbox.module.ts — Sandbox Backend Module (NestJS 11)
// Mô-đun đóng gói toàn bộ phân hệ Developer Sandbox.
// Cung cấp môi trường thử nghiệm cô lập cho Connector, Workflow & AI.
//
// Phụ thuộc:
//   - TenancyModule → PrismaService (PostgreSQL) cho persistent state
//   - VirtualCostInterceptor → ghi nhận cost ảo cho telemetry
// ===================================================================

import { Module } from '@nestjs/common';
import { SandboxController } from './sandbox.controller';
import { SandboxService } from './sandbox.service';
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
 * - providers:  SandboxService (business logic) + VirtualCostInterceptor
 * - exports:    SandboxService → cho phép module khác (vd: WorkflowsModule)
 *               tái sử dụng logic sandbox mà không inject lại
 */
@Module({
  imports: [TenancyModule],
  controllers: [SandboxController],
  providers: [SandboxService, VirtualCostInterceptor],
  exports: [SandboxService],
})
export class SandboxModule {}
