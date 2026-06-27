import { IsString, IsNotEmpty } from 'class-validator';

/**
 * DTO — Compile AWL (raw AWL source → AST)
 *
 * Nhận mã AWL dạng text (human-readable workflow language),
 * trả về AST cấu trúc parsed để frontend Playground render trực quan.
 */
export class CompileAwlDto {
  /**
   * Mã AWL nguồn — văn bản gốc do người dùng nhập hoặc AI sinh.
   * Ví dụ:
   *   workflow "Order Confirm"
   *   trigger: event
   *   steps:
   *     - id: send-zalo
   *       type: send
   *       name: Gửi Zalo xác nhận
   */
  @IsString()
  @IsNotEmpty({ message: 'AWL source code is required' })
  code!: string;
}
