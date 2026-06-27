import {
  Controller,
  Post,
  Get,
  Headers,
  Param,
  Body,
  Query,
  UsePipes,
  ValidationPipe,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import {
  PublishWorkflowTemplateDto,
  ReviewMarketplaceTemplateDto,
} from './dto/publish-workflow.dto';
import { PrismaService } from '../prisma.service';

/**
 * MarketplacePublishController — v1 Publish / Review / Public Hierarchy.
 *
 * Ba endpoint cốt lõi cho luồng phát hành template:
 *   1. POST   /v1/marketplace/templates/:id/publish   — Developer gửi template ra marketplace
 *   2. POST   /v1/marketplace/templates/:id/review    — Admin duyệt/từ chối template
 *   3. GET    /v1/marketplace/public                  — Public listing đã duyệt (phân trang)
 *   4. GET    /v1/marketplace/templates/pending       — Pending templates queue (admin)
 *
 * Tất cả endpoint đều nhúng DTO với ValidationPipe({ whitelist: true })
 * để tự động chặn tham số rác (unknown properties) gửi vào từ client.
 */
@Controller('v1/marketplace')
export class MarketplacePublishController {
  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly prisma: PrismaService,
  ) {}

  // ═════════════════════════════════════════════════════════════════════
  //  ENDPOINT 1 — Developer Publish
  // ═════════════════════════════════════════════════════════════════════

  /**
   * POST /v1/marketplace/templates/:id/publish
   *
   * Developer đệ trình template lên marketplace để chờ phê duyệt.
   *
   * Bảo mật:
   *   - `tenantId` được trích xuất từ HTTP Header `x-tenant-id`, KHÔNG từ body
   *   - Service tự kiểm tra IDOR: chỉ owner mới publish được template của mình
   *   - `@UsePipes(new ValidationPipe({ whitelist: true }))` quét sạch
   *     tham số rác (properties không khai báo trong DTO)
   *
   * @param tenantId  Tenant identifier từ header (bắt buộc, nếu thiếu sẽ undefined)
   * @param id        Template ID (UUID)
   * @param dto       PublishWorkflowTemplateDto — isPublic + developerNotes
   */
  @Post('templates/:id/publish')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async requestPublish(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: PublishWorkflowTemplateDto,
  ) {
    return this.marketplaceService.requestPublish(id, tenantId, dto);
  }

  // ═════════════════════════════════════════════════════════════════════
  //  ENDPOINT 2 — Admin Review
  // ═════════════════════════════════════════════════════════════════════

  /**
   * POST /v1/marketplace/templates/:id/review
   *
   * Endpoint quản trị — phê duyệt (APPROVED) hoặc từ chối (REJECTED) template.
   *
   * Không kiểm tra tenantId vì đây là endpoint admin, việc phân quyền
   * được xử lý riêng ở Guard layer (AuthGuard/RolesGuard).
   *
   * @param id   Template ID (UUID)
   * @param dto  ReviewMarketplaceTemplateDto — status + adminComment
   */
  @Post('templates/:id/review')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async reviewTemplate(
    @Param('id') id: string,
    @Body() dto: ReviewMarketplaceTemplateDto,
  ) {
    return this.marketplaceService.reviewTemplate(id, dto);
  }

  // ═════════════════════════════════════════════════════════════════════
  //  ENDPOINT 3 — Public Marketplace Listing
  // ═════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/marketplace/public
   *
   * Public marketplace — trả về các template đã được duyệt (APPROVED + isPublic = true)
   * với phân trang an toàn.
   *
   * Tham số query:
   *   - page:     trang hiện tại (mặc định 1)
   *   - pageSize: số item mỗi trang (mặc định 20, tối đa 50)
   *
   * An toàn:
   *   - ParseIntPipe + DefaultValuePipe đảm bảo giá trị luôn là số
   *   - Service tự clamp pageSize tối đa 50 để tránh query quá tải
   */
  @Get('public')
  async getPublicMarketplace(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize?: number,
  ) {
    return this.marketplaceService.getPublicMarketplace(
      Math.max(1, page ?? 1),
      Math.max(1, Math.min(pageSize ?? 20, 50)),
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  //  ENDPOINT 4 — Pending Templates (Admin Review Queue)
  // ═════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/marketplace/templates/pending
   *
   * Endpoint quản trị — lấy danh sách WorkflowTemplate đang chờ duyệt
   * (marketplaceStatus = 'PENDING'). Phân trang an toàn với hard clamp 50.
   *
   * Trả về các trường cần thiết cho admin review UI:
   *   id, key, name, description, category, industry, tags,
   *   developerNotes, version, createdAt
   *
   * Query params:
   *   - page     (number, mặc định 1)  — trang hiện tại
   *   - pageSize (number, mặc định 20) — số item mỗi trang (max 50)
   */
  @Get('templates/pending')
  async getPendingTemplates(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize?: number,
  ) {
    const safePage = Math.max(1, page ?? 1);
    const safeSize = Math.min(Math.max(1, pageSize ?? 20), 50);
    const skip = (safePage - 1) * safeSize;

    const where = { marketplaceStatus: 'PENDING' } as any;

    const [items, total] = await Promise.all([
      this.prisma.workflowTemplate.findMany({
        where,
        skip,
        take: safeSize,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          key: true,
          name: true,
          description: true,
          category: true,
          industry: true,
          tags: true,
          developerNotes: true,
          version: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.workflowTemplate.count({ where }),
    ]);

    return {
      items,
      total,
      page: safePage,
      pageSize: safeSize,
      totalPages: Math.ceil(total / safeSize),
    };
  }
}
