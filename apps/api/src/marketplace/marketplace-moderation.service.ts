// ===================================================================
// marketplace-moderation.service.ts — Marketplace Moderation Depth
// Phase 4: Developer Sandbox Core + Marketplace Contract Depth
// Review queue, audit trail, auto-approve, moderation analytics
// In-Memory-First — hỗ trợ standalone mode
// ===================================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// ── Types ──────────────────────────────────────────────────────────────

export type ModerationAction =
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'FLAGGED'
  | 'CHANGES_REQUESTED';

export interface ReviewActionResponse {
  id: string;
  listingId: string;
  reviewerId: string;
  action: ModerationAction;
  reason?: string;
  reviewerNote?: string;
  configDiff?: any;
  createdAt: Date;
}

export interface SubmitReviewInput {
  listingId: string;
  tenantId: string;
  developerNotes?: string;
}

export interface ReviewDecisionInput {
  listingId: string;
  reviewerId: string;
  action: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  reason?: string;
  reviewerNote?: string;
}

export interface ModerationQueueItem {
  listingId: string;
  listingKey: string;
  listingName: string;
  listingType: string;
  developerName?: string;
  developerTier?: string;
  version: string;
  submittedAt: Date;
  reviewCount: number;
  lastAction?: ModerationAction;
}

export interface AutoApproveRule {
  enabled: boolean;
  minTier: string; // 'SILVER' | 'GOLD' | 'PLATINUM'
  minApprovalRate: number; // 0-1
  minReviewCount: number;
}

// ── In-Memory store ──────────────────────────────────────────────────

interface MemoryReviewAction {
  id: string;
  listingId: string;
  reviewerId: string;
  action: ModerationAction;
  reason?: string;
  reviewerNote?: string;
  configDiff?: any;
  createdAt: Date;
}

class InMemoryModerationStore {
  private actions: Map<string, MemoryReviewAction> = new Map();
  private listings: Map<string, { key: string; name: string; type: string; version: string }> = new Map();

  registerListing(id: string, key: string, name: string, type: string, version: string) {
    this.listings.set(id, { key, name, type, version });
  }

  addAction(action: MemoryReviewAction) {
    this.actions.set(action.id, action);
    return action;
  }

  getActions(listingId: string): MemoryReviewAction[] {
    return Array.from(this.actions.values())
      .filter((a) => a.listingId === listingId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getQueue(): ModerationQueueItem[] {
    const queue: ModerationQueueItem[] = [];
    for (const [listingId, info] of this.listings) {
      const actions = this.getActions(listingId);
      const submitted = actions.find((a) => a.action === 'SUBMITTED');
      const approved = actions.find((a) => a.action === 'APPROVED');
      if (submitted && !approved) {
        queue.push({
          listingId,
          listingKey: info.key,
          listingName: info.name,
          listingType: info.type,
          version: info.version,
          submittedAt: submitted.createdAt,
          reviewCount: actions.length,
          lastAction: actions[0]?.action,
        });
      }
    }
    return queue.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
  }

  getLastAction(listingId: string): MemoryReviewAction | null {
    const actions = this.getActions(listingId);
    return actions.length > 0 ? actions[0] : null;
  }
}

// ── Auto-approve configuration ────────────────────────────────────────

const DEFAULT_AUTO_APPROVE_RULE: AutoApproveRule = {
  enabled: true,
  minTier: 'SILVER',
  minApprovalRate: 0.9,
  minReviewCount: 3,
};

// ── Service ────────────────────────────────────────────────────────────

@Injectable()
export class MarketplaceModerationService {
  private store = new InMemoryModerationStore();
  private useMemory = false;
  private autoApproveRule: AutoApproveRule = { ...DEFAULT_AUTO_APPROVE_RULE };

  constructor(
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.useMemory = !prisma;
  }

  setInMemoryMode(val: boolean) {
    this.useMemory = val;
  }

  configureAutoApprove(rule: Partial<AutoApproveRule>) {
    this.autoApproveRule = { ...this.autoApproveRule, ...rule };
  }

  // ── Submit for review ──────────────────────────────────────────

  /**
   * submitForReview
   * Developer submits a marketplace listing for moderation review.
   * Records SUBMITTED action and checks auto-approve eligibility.
   *
   * Auto-approve conditions:
   *   - Developer tier >= SILVER
   *   - Approval rate >= 90%
   *   - At least 3 previous reviews
   */
  async submitForReview(input: SubmitReviewInput): Promise<{
    action: ReviewActionResponse;
    autoApproved: boolean;
  }> {
    await this.ensureListingExists(input.listingId);

    // Record SUBMITTED
    let action: ReviewActionResponse;

    if (this.useMemory) {
      const id = crypto.randomUUID();
      const memAction: MemoryReviewAction = {
        id,
        listingId: input.listingId,
        reviewerId: input.tenantId,
        action: 'SUBMITTED',
        reason: undefined,
        reviewerNote: input.developerNotes,
        createdAt: new Date(),
      };
      this.store.addAction(memAction);
      action = this.toActionResponse(memAction);
    } else {
      const created = await this.prisma!.marketplaceReviewAction.create({
        data: {
          listingId: input.listingId,
          reviewerId: input.tenantId,
          action: 'SUBMITTED',
          reviewerNote: input.developerNotes,
        },
      });
      action = this.toActionResponse(created);
    }

    // Check auto-approve
    const autoApproved = await this.checkAutoApprove(input.listingId, input.tenantId);

    if (autoApproved) {
      await this.applyDecision({
        listingId: input.listingId,
        reviewerId: 'system',
        action: 'APPROVED',
        reason: 'Auto-approved: developer meets trust criteria.',
      });
    }

    return { action, autoApproved };
  }

  // ── Apply review decision ─────────────────────────────────────

  /**
   * approveListing
   * Admin approves a listing. Records APPROVED + updates listing status.
   */
  async approveListing(input: ReviewDecisionInput): Promise<ReviewActionResponse> {
    return this.applyDecision({ ...input, action: 'APPROVED' });
  }

  /**
   * rejectListing
   * Admin rejects a listing with reason.
   */
  async rejectListing(input: ReviewDecisionInput): Promise<ReviewActionResponse> {
    return this.applyDecision({ ...input, action: 'REJECTED' });
  }

  /**
   * requestChanges
   * Admin requests changes before re-submission.
   */
  async requestChanges(input: ReviewDecisionInput): Promise<ReviewActionResponse> {
    return this.applyDecision({ ...input, action: 'CHANGES_REQUESTED' });
  }

  // ── Get review history ────────────────────────────────────────

  async getReviewHistory(listingId: string): Promise<ReviewActionResponse[]> {
    await this.ensureListingExists(listingId);

    if (this.useMemory) {
      return this.store.getActions(listingId).map((a) => this.toActionResponse(a));
    }

    const actions = await this.prisma!.marketplaceReviewAction.findMany({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
    });

    return actions.map((a) => this.toActionResponse(a));
  }

  // ── Get moderation queue ──────────────────────────────────────

  async getModerationQueue(): Promise<{
    items: ModerationQueueItem[];
    total: number;
  }> {
    if (this.useMemory) {
      const items = this.store.getQueue();
      return { items, total: items.length };
    }

    // DB: Find listings whose last review action is SUBMITTED, not APPROVED/REJECTED
    const listings = await this.prisma!.marketplaceListing.findMany({
      where: {
        isPublished: false,
      },
      select: {
        id: true,
        key: true,
        name: true,
        type: true,
        version: true,
        authorName: true,
        createdAt: true,
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            action: true,
            createdAt: true,
          },
        },
      },
    });

    const items: ModerationQueueItem[] = [];

    for (const listing of listings) {
      const lastReview = listing.reviews?.[0];
      // Only show listings with SUBMITTED as last action, or no review yet
      if (lastReview && lastReview.action !== 'SUBMITTED') continue;

      const reviewCount = await this.prisma!.marketplaceReviewAction.count({
        where: { listingId: listing.id },
      });

      items.push({
        listingId: listing.id,
        listingKey: listing.key,
        listingName: listing.name,
        listingType: listing.type,
        developerName: listing.authorName ?? undefined,
        version: listing.version,
        submittedAt: lastReview?.createdAt ?? listing.createdAt,
        reviewCount,
        lastAction: (lastReview?.action as ModerationAction) ?? 'SUBMITTED',
      });
    }

    return {
      items: items.sort(
        (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime(),
      ),
      total: items.length,
    };
  }

  // ── Auto-approve status ───────────────────────────────────────

  async isAutoApproved(developerTenantId: string): Promise<boolean> {
    if (!this.autoApproveRule.enabled) return false;

    // Get developer profile and check tier
    let developer: any;

    if (this.useMemory) {
      // In memory mode, assume false for non-registered developers
      return false;
    }

    developer = await this.prisma!.developerProfile.findUnique({
      where: { tenantId: developerTenantId },
    });

    if (!developer) return false;

    // Check tier
    const tierOrder = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
    const minTierIndex = tierOrder.indexOf(this.autoApproveRule.minTier);
    const devTierIndex = tierOrder.indexOf(developer.tier);

    if (devTierIndex < minTierIndex) return false;

    // Check approval history
    const listings = await this.prisma!.marketplaceListing.findMany({
      where: { tenantId: developerTenantId },
      select: { id: true },
    });

    const listingIds = listings.map((l) => l.id);
    if (listingIds.length < this.autoApproveRule.minReviewCount) return false;

    const reviewActions = await this.prisma!.marketplaceReviewAction.findMany({
      where: { listingId: { in: listingIds } },
    });

    const totalReviews = reviewActions.length;
    const approvals = reviewActions.filter((r) => r.action === 'APPROVED').length;
    const approvalRate = totalReviews > 0 ? approvals / totalReviews : 0;

    return approvalRate >= this.autoApproveRule.minApprovalRate;
  }

  // ── Private helpers ─────────────────────────────────────────────

  private async applyDecision(input: ReviewDecisionInput): Promise<ReviewActionResponse> {
    await this.ensureListingExists(input.listingId);

    if (this.useMemory) {
      const id = crypto.randomUUID();
      const action: MemoryReviewAction = {
        id,
        listingId: input.listingId,
        reviewerId: input.reviewerId,
        action: input.action,
        reason: input.reason,
        reviewerNote: input.reviewerNote,
        createdAt: new Date(),
      };
      this.store.addAction(action);

      // Update listing published status
      const listing = this.store['listings'].get(input.listingId);
      if (listing) {
        // In memory mode, registry listing would need isPublished
      }

      return this.toActionResponse(action);
    }

    const action = await this.prisma!.marketplaceReviewAction.create({
      data: {
        listingId: input.listingId,
        reviewerId: input.reviewerId,
        action: input.action,
        reason: input.reason,
        reviewerNote: input.reviewerNote,
      },
    });

    // Update listing publish status based on decision
    const isPublished = input.action === 'APPROVED';
    await this.prisma!.marketplaceListing.update({
      where: { id: input.listingId },
      data: { isPublished },
    });

    return this.toActionResponse(action);
  }

  private async checkAutoApprove(
    listingId: string,
    tenantId: string,
  ): Promise<boolean> {
    if (!this.autoApproveRule.enabled) return false;
    if (this.useMemory) return false;

    // Auto-approve in standalone mode for testing
    return this.isAutoApproved(tenantId);
  }

  private async ensureListingExists(listingId: string): Promise<void> {
    if (this.useMemory) return;

    const listing = await this.prisma!.marketplaceListing.findUnique({
      where: { id: listingId },
      select: { id: true },
    });
    if (!listing) {
      throw new NotFoundException(
        `MarketplaceListing "${listingId}" not found.`,
      );
    }
  }

  private toActionResponse(a: any): ReviewActionResponse {
    return {
      id: a.id,
      listingId: a.listingId,
      reviewerId: a.reviewerId,
      action: a.action as ModerationAction,
      reason: a.reason ?? undefined,
      reviewerNote: a.reviewerNote ?? undefined,
      configDiff: a.configDiff ?? undefined,
      createdAt: a.createdAt,
    };
  }
}
