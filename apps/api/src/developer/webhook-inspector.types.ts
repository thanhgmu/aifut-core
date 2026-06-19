// ============================================================================
// Webhook Inspector — Telemetry Types
// ============================================================================
// Định nghĩa kiểu dữ liệu và interface cho trình thanh tra gói tin Webhook
// thuộc phân hệ Backend apps/api — phục vụ đo đạc viễn trắc mạng (Telemetry).
// ============================================================================

/**
 * Hướng đi của gói tin Webhook.
 * INBOUND:  gói tin từ bên ngoài gửi vào tenant (webhook nhận).
 * OUTBOUND: gói tin từ tenant gửi ra bên ngoài (webhook gọi đi).
 */
export type WebhookDirection = 'INBOUND' | 'OUTBOUND';

/**
 * Dữ liệu đầu vào để ghi nhận một nhật ký gói tin Webhook.
 * Được dùng bởi WebhookInspectorService khi bắt/ghi log.
 */
export interface CreateWebhookLogDto {
  /** ID của tenant sở hữu log này (bắt buộc). */
  tenantId: string;

  /** ID của endpoint nguồn/đích (tuỳ chọn — có thể null nếu chưa mapping). */
  endpointId?: string;

  /** HTTP method của request (VD: GET, POST, PUT, DELETE...). */
  method: string;

  /** HTTP headers dạng key-value, có thể lưu flattened. */
  headers: Record<string, string>;

  /** Body payload dạng JSON string hoặc raw string. */
  payload: string;

  /** Mã trạng thái HTTP phản hồi (tuỳ chọn — chỉ có sau khi nhận response). */
  responseStatus?: number;

  /** Body của phản hồi (tuỳ chọn). */
  responseBody?: string;

  /** Thời gian xử lý tính bằng mili-giây. */
  durationMs: number;

  /** Hướng đi của gói tin (INBOUND | OUTBOUND). */
  direction: WebhookDirection;
}

/**
 * Tham số lọc tra cứu nhật ký Webhook phục vụ Console UI.
 * Hỗ trợ phân trang và các bộ lọc cơ bản (hướng, method, status...).
 */
export interface WebhookQueryFilterDto {
  /** Số trang (bắt đầu từ 1). */
  page: number;

  /** Số bản ghi tối đa trên một trang. */
  pageSize: number;

  /** Lọc theo hướng gói tin (tuỳ chọn). */
  direction?: WebhookDirection;

  /** Lọc theo HTTP method (tuỳ chọn). */
  method?: string;

  /** Lọc theo mã trạng thái HTTP phản hồi (tuỳ chọn). */
  status?: number;
}
