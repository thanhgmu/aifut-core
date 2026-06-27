import {
  IsBoolean,
  IsString,
  IsOptional,
  IsIn,
} from 'class-validator';

// ── Enums ───────────────────────────────────────────────────────────────

/** Trạng thái kiểm duyệt dành cho marketplace listing. */
export const REVIEW_STATUS_VALUES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUS_VALUES)[number];

// ── DTO Publish Workflow Template ───────────────────────────────────────

/**
 * DTO cho endpoint publish workflow template ra marketplace.
 * Người dùng submit template để công khai hoặc bán trên marketplace.
 */
export class PublishWorkflowTemplateDto {
  /**
   * True = public listing (ai cũng thấy). False = private draft.
   */
  @IsBoolean()
  isPublic!: boolean;

  /**
   * Ghi chú kỹ thuật từ developer — mô tả template hoạt động thế nào,
   * dependency cần có, hoặc hướng dẫn cấu hình thêm.
   * Trường không bắt buộc.
   */
  @IsString()
  @IsOptional()
  developerNotes?: string;
}

// ── DTO Review Marketplace Template ─────────────────────────────────────

/**
 * DTO cho endpoint kiểm duyệt listing của quản trị viên.
 * Admin duyệt (APPROVED) hoặc từ chối (REJECTED) template do cộng đồng submit.
 */
export class ReviewMarketplaceTemplateDto {
  /**
   * Trạng thái kiểm duyệt:
   * - PENDING: chưa xử lý (dùng cho update từ PENDING → PENDING, thực tế không nên dùng)
   * - APPROVED: duyệt thành công, listing được publish
   * - REJECTED: từ chối, listing bị gỡ khỏi hàng chờ
   */
  @IsString()
  @IsIn(REVIEW_STATUS_VALUES, {
    message: 'status must be one of: PENDING, APPROVED, REJECTED',
  })
  status!: string;

  /**
   * Nhận xét của admin — giải thích lý do duyệt hoặc từ chối.
   * Trường không bắt buộc.
   */
  @IsString()
  @IsOptional()
  adminComment?: string;
}
