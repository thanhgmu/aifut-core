// ============================================================
// sandbox.types.ts — Định nghĩa kiểu dữ liệu cho Sandbox Engine
// Hệ thống cô lập dòng tiền giả lập (Virtual Cash Flow Isolation)
// ============================================================

import { z } from 'zod';

// ─── SandboxActionType ──────────────────────────────────────
// Các hành động thử nghiệm được phép trong môi trường sandbox.
export type SandboxActionType =
  | 'AI_ROUTING'       // Gọi AI routing engine trong chế độ giả lập
  | 'CONNECTOR_EXEC'   // Thực thi connector mà không commit thật
  | 'WORKFLOW_RUN';    // Chạy workflow ở chế độ dry-run / trace

// ─── CreateSandboxSessionDto ─────────────────────────────────
// Dữ liệu đầu vào để khởi tạo một phiên sandbox mới.
export interface CreateSandboxSessionDto {
  /** Tên gợi nhớ cho phiên sandbox (ví dụ: "Test luồng thanh toán VNPay") */
  name: string;

  /** Tenant sở hữu phiên sandbox này */
  tenantId: string;
}

// ─── SandboxTracePayload ─────────────────────────────────────
// Cấu trúc nhật ký lưu vết cho mỗi hành động trong sandbox.
// virtualCostBigInt dùng kiểu string để đảm bảo an toàn khi
// serialize qua JSON (BigInt không được JSON.stringify hỗ trợ).
export interface SandboxTracePayload {
  /** Node/step ID trong workflow hoặc connector */
  nodeId: string;

  /** Loại hành động được thực thi */
  actionType: SandboxActionType;

  /** Payload đầu vào của hành động (dạng JSON object) */
  inputPayload: Record<string, unknown>;

  /** Chi phí ảo dạng string (BigInt an toàn JSON) */
  virtualCostBigInt: string;

  /** Trạng thái thành công hay thất bại */
  isSuccess: boolean;

  /** Thông báo lỗi nếu có (undefined khi isSuccess = true) */
  errorMessage?: string;
}

// ─── SandboxSession ──────────────────────────────────────────
// Phiên sandbox hoàn chỉnh lưu trong database.
export interface SandboxSession {
  id: string;
  name: string;
  tenantId: string;
  trace: SandboxTracePayload[];
  totalVirtualCost: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Zod schemas (validation) ────────────────────────────────
export const CreateSandboxSessionSchema = z.object({
  name: z
    .string()
    .min(1, 'Tên phiên sandbox không được để trống')
    .max(128, 'Tên phiên sandbox tối đa 128 ký tự'),
  tenantId: z.string().uuid('tenantId phải là UUID hợp lệ'),
});

export const SandboxTracePayloadSchema = z.object({
  nodeId: z.string().min(1),
  actionType: z.enum(['AI_ROUTING', 'CONNECTOR_EXEC', 'WORKFLOW_RUN']),
  inputPayload: z.record(z.unknown()),
  virtualCostBigInt: z.string().regex(/^\d+$/, 'virtualCostBigInt phải là chuỗi số nguyên dương'),
  isSuccess: z.boolean(),
  errorMessage: z.string().optional(),
});
