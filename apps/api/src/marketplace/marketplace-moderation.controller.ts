// ===================================================================
// marketplace-moderation.controller.ts — Moderation REST endpoints
// Phase 4: Developer Sandbox Core + Marketplace Contract Depth
// Review queue, approve/reject/request-changes, audit history
// ===================================================================

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
  ParseUUIDPipe,
} from '@nestjs/common';
import { MarketplaceModerationService } from './marketplace-moderation.service';

// ── DTOs ──────────────────────────────────────────────────────────────

class SubmitReviewDto {
  developerNotes?: string;
}

class ReviewDecisionDto {
  reason?: string;
  reviewerNote?: string;
}

// ── Controller ────────────────────────────────────────────────────────

@Controller('v1/marketplace')
export class MarketplaceModerationController {
  constructor(
    private readonly moderationService: MarketplaceModerationService,
  ) {}

  /**
   * POST /v1/marketplace/listings/:id/submit
   *
   * Developer submits a listing for moderation review.
   * Auto-approve may trigger if developer meets trust criteria.
   */
  @Post('listings/:id/submit')
  async submitForReview(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.moderationService.submitForReview({
      listingId,
      tenantId,
      developerNotes: dto.developerNotes,
    });
  }

  /**
   * POST /v1/marketplace/listings/:id/approve
   *
   * Admin approves a listing, making it public.
   */
  @Post('listings/:id/approve')
  async approveListing(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.moderationService.approveListing({
      listingId,
      reviewerId: tenantId,
      action: 'APPROVED',
      reason: dto.reason,
      reviewerNote: dto.reviewerNote,
    });
  }

  /**
   * POST /v1/marketplace/listings/:id/reject
   *
   * Admin rejects a listing with reason.
   */
  @Post('listings/:id/reject')
  async rejectListing(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.moderationService.rejectListing({
      listingId,
      reviewerId: tenantId,
      action: 'REJECTED',
      reason: dto.reason,
      reviewerNote: dto.reviewerNote,
    });
  }

  /**
   * POST /v1/marketplace/listings/:id/request-changes
   *
   * Admin requests changes before re-submission.
   */
  @Post('listings/:id/request-changes')
  async requestChanges(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.moderationService.requestChanges({
      listingId,
      reviewerId: tenantId,
      action: 'CHANGES_REQUESTED',
      reason: dto.reason,
      reviewerNote: dto.reviewerNote,
    });
  }

  /**
   * GET /v1/marketplace/listings/:id/review-history
   *
   * Full audit trail of moderation actions for a listing.
   */
  @Get('listings/:id/review-history')
  async getReviewHistory(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id', ParseUUIDPipe) listingId: string,
  ) {
    return this.moderationService.getReviewHistory(listingId);
  }

  /**
   * GET /v1/marketplace/moderation/queue
   *
   * Admin moderation queue — listings pending review.
   */
  @Get('moderation/queue')
  async getModerationQueue(@Headers('x-tenant-id') tenantId: string) {
    return this.moderationService.getModerationQueue();
  }
}
