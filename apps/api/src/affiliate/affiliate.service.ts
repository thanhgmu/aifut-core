import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { randomBytes } from 'crypto';

@Injectable()
export class AffiliateService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Account ──────────────────────────────────────────────────────────

  async createAccount(tenantId: string, data: {
    commissionRate?: number;
    commissionType?: 'PERCENTAGE' | 'FIXED' | 'TIERED';
    payoutMethod?: string;
    payoutDetails?: string;
    cookieDays?: number;
    autoApprove?: boolean;
    notes?: string;
  }) {
    const existing = await this.prisma.affiliateAccount.findUnique({ where: { tenantId } });
    if (existing) throw new ConflictException('Tenant already has an affiliate account');
    const referralCode = this.generateReferralCode();
    return this.prisma.affiliateAccount.create({
      data: {
        tenantId, referralCode,
        commissionRate: data.commissionRate ?? 0.1,
        commissionType: data.commissionType ?? 'PERCENTAGE',
        payoutMethod: data.payoutMethod, payoutDetails: data.payoutDetails,
        cookieDays: data.cookieDays ?? 30, autoApprove: data.autoApprove ?? false,
        notes: data.notes, status: 'PENDING',
      },
    });
  }

  async getAccount(tenantId: string) {
    const account = await this.prisma.affiliateAccount.findUnique({
      where: { tenantId },
      include: { links: true, conversions: { take: 20, orderBy: { createdAt: 'desc' } } },
    });
    if (!account) throw new NotFoundException('Affiliate account not found');
    return account;
  }

  async updateAccount(tenantId: string, data: {
    status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'DISABLED';
    commissionRate?: number; commissionType?: 'PERCENTAGE' | 'FIXED' | 'TIERED';
    payoutMethod?: string; payoutDetails?: string;
    cookieDays?: number; autoApprove?: boolean; notes?: string;
  }) {
    const account = await this.prisma.affiliateAccount.findUnique({ where: { tenantId } });
    if (!account) throw new NotFoundException('Affiliate account not found');
    return this.prisma.affiliateAccount.update({ where: { tenantId }, data });
  }

  // ── Links ─────────────────────────────────────────────────────────────

  async createLink(tenantId: string, data: {
    key?: string; label: string; targetUrl: string;
    destination?: string; campaign?: string; metadata?: Record<string, any>;
  }) {
    const account = await this.prisma.affiliateAccount.findUnique({ where: { tenantId } });
    if (!account) throw new NotFoundException('Create affiliate account first');
    if (account.status !== 'ACTIVE') throw new BadRequestException('Account not active');
    const key = data.key ?? this.generateLinkKey(account.referralCode);
    const existing = await this.prisma.affiliateLink.findUnique({ where: { key } });
    if (existing) throw new ConflictException(`Link key '${key}' exists`);
    return this.prisma.affiliateLink.create({
      data: { accountId: account.id, key, label: data.label, targetUrl: data.targetUrl,
        destination: data.destination ?? 'signup', campaign: data.campaign, metadata: data.metadata ?? {} },
    });
  }

  async getLinks(tenantId: string) {
    const a = await this.prisma.affiliateAccount.findUnique({ where: { tenantId } });
    if (!a) throw new NotFoundException('Affiliate account not found');
    return this.prisma.affiliateLink.findMany({ where: { accountId: a.id }, orderBy: { createdAt: 'desc' } });
  }

  async updateLink(tenantId: string, linkKey: string, data: {
    label?: string; targetUrl?: string; destination?: string;
    campaign?: string; isActive?: boolean; metadata?: Record<string, any>;
  }) {
    const a = await this.prisma.affiliateAccount.findUnique({ where: { tenantId } });
    if (!a) throw new NotFoundException('Affiliate account not found');
    const link = await this.prisma.affiliateLink.findUnique({ where: { key: linkKey } });
    if (!link || link.accountId !== a.id) throw new NotFoundException('Link not found');
    return this.prisma.affiliateLink.update({ where: { key: linkKey }, data });
  }

  // ── Click tracking ───────────────────────────────────────────────────

  async recordClick(linkKey: string, meta?: { ipAddress?: string; userAgent?: string }) {
    const link = await this.prisma.affiliateLink.findUnique({ where: { key: linkKey } });
    if (!link || !link.isActive) return { tracked: false, reason: 'Link not found or inactive' };
    await this.prisma.affiliateLink.update({ where: { key: linkKey }, data: { clickCount: { increment: 1 } } });
    return { tracked: true, targetUrl: link.targetUrl };
  }

  // ── Conversions ──────────────────────────────────────────────────────

  async recordConversion(data: {
    accountId: string; linkId?: string; tenantId?: string;
    customerEmail?: string; customerName?: string; conversionType: string;
    revenueAmount?: number; currency?: string; referralCode?: string;
    ipAddress?: string; userAgent?: string; linkKey?: string;
  }) {
    let linkId = data.linkId;
    if (data.linkKey) {
      const link = await this.prisma.affiliateLink.findUnique({ where: { key: data.linkKey } });
      linkId = link?.id;
    }
    const account = await this.prisma.affiliateAccount.findUnique({ where: { id: data.accountId } });
    if (!account) throw new NotFoundException('Affiliate account not found');
    const revenueAmount = data.revenueAmount ?? 0;
    let commissionAmount = 0;
    if (account.commissionType === 'PERCENTAGE') commissionAmount = revenueAmount * account.commissionRate;
    else if (account.commissionType === 'FIXED') commissionAmount = account.commissionRate;

    const conversion = await this.prisma.affiliateConversion.create({
      data: {
        accountId: data.accountId, linkId, tenantId: data.tenantId,
        customerEmail: data.customerEmail, customerName: data.customerName,
        conversionType: data.conversionType, commissionAmount, revenueAmount,
        currency: data.currency ?? 'VND', referralCode: data.referralCode ?? account.referralCode,
        ipAddress: data.ipAddress, userAgent: data.userAgent,
        commissionStatus: account.autoApprove ? 'APPROVED' : 'PENDING',
        expiresAt: new Date(Date.now() + account.cookieDays * 86400000),
      },
    });
    await this.prisma.affiliateAccount.update({
      where: { id: data.accountId },
      data: { totalEarned: { increment: commissionAmount }, totalConversions: { increment: 1 } },
    });
    return conversion;
  }

  async getConversions(tenantId: string, status?: string) {
    const a = await this.prisma.affiliateAccount.findUnique({ where: { tenantId } });
    if (!a) throw new NotFoundException('Affiliate account not found');
    const where: any = { accountId: a.id };
    if (status) where.commissionStatus = status;
    return this.prisma.affiliateConversion.findMany({ where, include: { link: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async updateConversionStatus(tenantId: string, conversionId: string, status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED') {
    const a = await this.prisma.affiliateAccount.findUnique({ where: { tenantId } });
    if (!a) throw new NotFoundException('Affiliate account not found');
    const c = await this.prisma.affiliateConversion.findUnique({ where: { id: conversionId } });
    if (!c || c.accountId !== a.id) throw new NotFoundException('Conversion not found');
    return this.prisma.affiliateConversion.update({ where: { id: conversionId }, data: { commissionStatus: status } });
  }

  // ── Payouts ──────────────────────────────────────────────────────────

  async createPayout(tenantId: string, data: { amount: number; currency?: string; notes?: string }) {
    const account = await this.prisma.affiliateAccount.findUnique({ where: { tenantId } });
    if (!account) throw new NotFoundException('Affiliate account not found');
    const approved = await this.prisma.affiliateConversion.findMany({
      where: { accountId: account.id, commissionStatus: 'APPROVED' },
    });
    if (approved.length === 0) throw new BadRequestException('No approved conversions to pay');
    const totalApproved = approved.reduce((s, c) => s + c.commissionAmount, 0);
    if (data.amount > totalApproved) throw new BadRequestException(`Amount ${data.amount} exceeds ${totalApproved}`);
    const payout = await this.prisma.commissionPayout.create({
      data: {
        accountId: account.id, amount: data.amount, currency: data.currency ?? 'VND',
        payoutMethod: account.payoutMethod, status: 'PENDING', notes: data.notes,
        conversionIds: approved.map(c => c.id),
        periodStart: approved[0].createdAt,
        periodEnd: approved[approved.length - 1].createdAt,
      },
    });
    await this.prisma.affiliateConversion.updateMany({
      where: { id: { in: approved.map(c => c.id) } },
      data: { commissionStatus: 'PAID' },
    });
    await this.prisma.affiliateAccount.update({
      where: { id: account.id }, data: { totalPaid: { increment: data.amount } },
    });
    return payout;
  }

  async getPayouts(tenantId: string) {
    const a = await this.prisma.affiliateAccount.findUnique({ where: { tenantId } });
    if (!a) throw new NotFoundException('Affiliate account not found');
    return this.prisma.commissionPayout.findMany({ where: { accountId: a.id }, orderBy: { createdAt: 'desc' } });
  }

  // ── Public tracking ──────────────────────────────────────────────────

  async trackPublicConversion(data: {
    referralCode: string; conversionType?: string;
    customerEmail?: string; customerName?: string; revenueAmount?: number; linkKey?: string;
  }) {
    const account = await this.prisma.affiliateAccount.findUnique({ where: { referralCode: data.referralCode } });
    if (!account || account.status !== 'ACTIVE') return { tracked: false, reason: 'Invalid referral code' };
    return this.recordConversion({
      accountId: account.id, linkKey: data.linkKey, customerEmail: data.customerEmail,
      customerName: data.customerName, conversionType: data.conversionType ?? 'signup',
      revenueAmount: data.revenueAmount ?? 0, referralCode: data.referralCode,
    });
  }

  async getPublicAccountInfo(referralCode: string) {
    const account = await this.prisma.affiliateAccount.findUnique({
      where: { referralCode },
      select: { referralCode: true, status: true, links: {
        where: { isActive: true },
        select: { key: true, label: true, targetUrl: true, destination: true, campaign: true },
      }},
    });
    if (!account || account.status !== 'ACTIVE') throw new NotFoundException('Affiliate program not found');
    return account;
  }

  // ── Dashboard ────────────────────────────────────────────────────────

  async getDashboard(tenantId: string) {
    const account = await this.prisma.affiliateAccount.findUnique({ where: { tenantId } });
    if (!account) return { hasAccount: false, message: 'Create an affiliate account to start' };
    const recent = await this.prisma.affiliateConversion.findMany({
      where: { accountId: account.id }, orderBy: { createdAt: 'desc' }, take: 10,
      include: { link: { select: { label: true } } },
    });
    const allLinks = await this.prisma.affiliateLink.findMany({ where: { accountId: account.id }, select: { clickCount: true } });
    return {
      hasAccount: true,
      account: { id: account.id, referralCode: account.referralCode, status: account.status,
        commissionRate: account.commissionRate, commissionType: account.commissionType,
        totalEarned: account.totalEarned, totalPaid: account.totalPaid,
        totalConversions: account.totalConversions, cookieDays: account.cookieDays },
      links: allLinks.length,
      activeLinks: await this.prisma.affiliateLink.count({ where: { accountId: account.id, isActive: true } }),
      totalClicks: allLinks.reduce((s, l) => s + l.clickCount, 0),
      recentConversions: recent,
    };
  }

  // ── Admin ────────────────────────────────────────────────────────────

  async listAll() {
    return this.prisma.affiliateAccount.findMany({
      include: { tenant: { select: { name: true, slug: true } }, _count: { select: { links: true, conversions: true } } },
      orderBy: { totalEarned: 'desc' },
    });
  }

  private generateReferralCode(): string {
    return `AFF-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private generateLinkKey(referralCode: string): string {
    return `${referralCode.toLowerCase().replace(/[^a-z0-9]/g, '')}-${randomBytes(3).toString('hex')}`;
  }
}
