// ═══════════════════════════════════════════════════════════════════════════
// licensing.service.ts — On-Premise License Key Management Engine
// ═══════════════════════════════════════════════════════════════════════════
// Quản lý license cho on-premise / air-gapped deployment:
//   • Generate license key với mã hóa
//   • Activate / validate / revoke license
//   • Kiểm tra hạn dùng và feature entitlement
// ═══════════════════════════════════════════════════════════════════════════

import * as crypto from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LicenseStatus, LicenseTier, Prisma } from '@prisma/client';

// ── Types ─────────────────────────────────────────────────────────────────

export interface GenerateLicenseInput {
  tier: LicenseTier;
  maxUsers?: number;
  maxWorkflows?: number;
  features?: string[];
  issuedTo?: string;
  issuedEmail?: string;
  validityDays?: number; // null = no expiry
}

export interface ActivateLicenseInput {
  key: string;
  tenantId: string;
}

export interface LicenseResponse {
  id: string;
  key: string;
  tier: string;
  status: string;
  tenantId: string | null;
  maxUsers: number;
  maxWorkflows: number;
  features: string[];
  issuedTo: string | null;
  issuedEmail: string | null;
  issuedAt: Date;
  activatedAt: Date | null;
  expiresAt: Date | null;
  isExpired: boolean;
  daysRemaining: number | null;
}

export interface LicenseStatusResponse {
  valid: boolean;
  license: LicenseResponse | null;
  message: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Default validity: 365 days */
const DEFAULT_VALIDITY_DAYS = 365;

/** Free trial validity: 14 days */
const TRIAL_VALIDITY_DAYS = 14;

/** License key prefix */
const KEY_PREFIX = 'AIFUT';

/** License key segment length */
const KEY_SEGMENT_LENGTH = 4;

/** Number of segments (excluding prefix) */
const KEY_SEGMENTS = 4;

/** Features by tier */
const TIER_FEATURES: Record<LicenseTier, string[]> = {
  STARTER: ['core_workflow', 'local_runtime', 'basic_connectors', '1_user'],
  PRO: [
    'core_workflow',
    'local_runtime',
    'all_connectors',
    'unlimited_users',
    'cloud_backup',
    'multi_device',
    'ai_500_calls',
    'marketplace_access',
  ],
  TEAM: [
    'core_workflow',
    'local_runtime',
    'all_connectors',
    'unlimited_users',
    'cloud_backup',
    'multi_device',
    'ai_2000_calls',
    'marketplace_access',
    'analytics',
    'custom_domain',
    'api_access',
  ],
  ENTERPRISE: [
    'core_workflow',
    'local_runtime',
    'all_connectors',
    'unlimited_users',
    'cloud_backup',
    'multi_device',
    'unlimited_ai',
    'marketplace_access',
    'analytics',
    'custom_domain',
    'api_access',
    'audit_trail',
    'sovereign_mode',
    'priority_support',
    'white_label',
  ],
};

const TIER_MAX_USERS: Record<LicenseTier, number> = {
  STARTER: 1,
  PRO: 3,
  TEAM: 10,
  ENTERPRISE: -1, // unlimited
};

const TIER_MAX_WORKFLOWS: Record<LicenseTier, number> = {
  STARTER: 10,
  PRO: -1, // unlimited
  TEAM: -1,
  ENTERPRISE: -1,
};

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class LicensingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * generateKey
   * ───────────
   * Tạo license key mới. Admin-only.
   * Key format: AIFUT-XXXX-XXXX-XXXX-XXXX (hex, uppercase)
   */
  async generateKey(
    input: GenerateLicenseInput,
  ): Promise<LicenseResponse> {
    // ── Generate unique key ──────────────────────────────────────────
    let key: string;
    let isUnique = false;

    while (!isUnique) {
      key = this.createKeyString();
      const existing = await this.prisma.licenseKey.findUnique({
        where: { key },
      });
      if (!existing) isUnique = true;
    }

    // ── Resolve defaults ─────────────────────────────────────────────
    const maxUsers = input.maxUsers ?? TIER_MAX_USERS[input.tier] ?? 5;
    const maxWorkflows =
      input.maxWorkflows ?? TIER_MAX_WORKFLOWS[input.tier] ?? -1;
    const features = input.features ?? TIER_FEATURES[input.tier] ?? [];
    const validityDays =
      input.validityDays ?? DEFAULT_VALIDITY_DAYS;
    const expiresAt = validityDays > 0
      ? new Date(Date.now() + validityDays * 86_400_000)
      : null;

    // ── Create ───────────────────────────────────────────────────────
    const license = await this.prisma.licenseKey.create({
      data: {
        key: key!,
        tier: input.tier,
        status: LicenseStatus.PENDING,
        maxUsers,
        maxWorkflows,
        features: features as Prisma.InputJsonValue,
        issuedTo: input.issuedTo ?? null,
        issuedEmail: input.issuedEmail ?? null,
        expiresAt,
      },
    });

    return this.toLicenseResponse(license);
  }

  /**
   * generateTrialKey
   * ────────────────
   * Tạo trial key ngắn hạn cho tenant mới (14 ngày).
   * Auto-activate khi tạo.
   */
  async generateTrialKey(tenantId: string): Promise<LicenseResponse> {
    const existing = await this.prisma.licenseKey.findFirst({
      where: { tenantId, status: LicenseStatus.ACTIVE },
    });
    if (existing) {
      return this.toLicenseResponse(existing);
    }

    const key = this.createKeyString();
    const expiresAt = new Date(
      Date.now() + TRIAL_VALIDITY_DAYS * 86_400_000,
    );

    const license = await this.prisma.licenseKey.create({
      data: {
        key,
        tier: LicenseTier.PRO,
        status: LicenseStatus.ACTIVE,
        tenantId,
        maxUsers: TIER_MAX_USERS[LicenseTier.PRO],
        maxWorkflows: TIER_MAX_WORKFLOWS[LicenseTier.PRO],
        features: TIER_FEATURES[LicenseTier.PRO] as Prisma.InputJsonValue,
        activatedAt: new Date(),
        expiresAt,
      },
    });

    return this.toLicenseResponse(license);
  }

  /**
   * activateKey
   * ───────────
   * Kích hoạt license key cho một tenant.
   * Kiểm tra: key tồn tại, chưa bị dùng, chưa hết hạn.
   */
  async activateKey(input: ActivateLicenseInput): Promise<LicenseResponse> {
    const { key, tenantId } = input;

    const license = await this.prisma.licenseKey.findUnique({
      where: { key: key.toUpperCase() },
    });
    if (!license) {
      throw new NotFoundException('License key không tồn tại.');
    }

    // Check status
    if (license.status === LicenseStatus.REVOKED) {
      throw new ForbiddenException('License key đã bị thu hồi.');
    }
    if (license.status === LicenseStatus.EXPIRED) {
      throw new ForbiddenException('License key đã hết hạn.');
    }
    if (license.status === LicenseStatus.ACTIVE) {
      if (license.tenantId === tenantId) {
        return this.toLicenseResponse(license); // Already activated by this tenant
      }
      throw new ConflictException(
        'License key đã được kích hoạt bởi tenant khác.',
      );
    }

    // Check expiry
    if (license.expiresAt && license.expiresAt < new Date()) {
      await this.prisma.licenseKey.update({
        where: { id: license.id },
        data: { status: LicenseStatus.EXPIRED },
      });
      throw new BadRequestException('License key đã hết hạn.');
    }

    // Activate
    const updated = await this.prisma.licenseKey.update({
      where: { id: license.id },
      data: {
        status: LicenseStatus.ACTIVE,
        tenantId,
        activatedAt: new Date(),
      },
    });

    return this.toLicenseResponse(updated);
  }

  /**
   * validateLicense
   * ───────────────
   * Kiểm tra license hợp lệ cho tenant.
   * Gọi mỗi khi tenant cần verify quyền dùng on-premise.
   */
  async validateLicense(tenantId: string): Promise<LicenseStatusResponse> {
    const license = await this.prisma.licenseKey.findFirst({
      where: { tenantId, status: LicenseStatus.ACTIVE },
    });

    if (!license) {
      return {
        valid: false,
        license: null,
        message: 'Không tìm thấy license hợp lệ. Vui lòng kích hoạt license.',
      };
    }

    // Check expiry
    if (license.expiresAt && license.expiresAt < new Date()) {
      await this.prisma.licenseKey.update({
        where: { id: license.id },
        data: { status: LicenseStatus.EXPIRED },
      });
      return {
        valid: false,
        license: this.toLicenseResponse(license),
        message: 'License đã hết hạn. Vui lòng gia hạn.',
      };
    }

    return {
      valid: true,
      license: this.toLicenseResponse(license),
      message: 'License hợp lệ.',
    };
  }

  /**
   * checkFeature
   * ────────────
   * Kiểm tra tenant có quyền dùng feature cụ thể không.
   */
  async checkFeature(
    tenantId: string,
    featureKey: string,
  ): Promise<boolean> {
    const license = await this.prisma.licenseKey.findFirst({
      where: { tenantId, status: LicenseStatus.ACTIVE },
    });
    if (!license) return false;

    // Check expiry
    if (license.expiresAt && license.expiresAt < new Date()) return false;

    const features = license.features as string[];
    return features.includes(featureKey);
  }

  /**
   * listLicenses
   * ────────────
   * Liệt kê tất cả license (admin).
   */
  async listLicenses(options: {
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { status, page = 1, pageSize = 20 } = options;
    const where: any = {};
    if (status) where.status = status;

    const safePage = Math.max(1, page);
    const safePageSize = Math.min(Math.max(1, pageSize), 100);
    const skip = (safePage - 1) * safePageSize;

    const [items, total] = await Promise.all([
      this.prisma.licenseKey.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safePageSize,
      }),
      this.prisma.licenseKey.count({ where }),
    ]);

    return {
      items: items.map((l) => this.toLicenseResponse(l)),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
    };
  }

  /**
   * getTenantLicense
   * ────────────────
   * Lấy license hiện tại của tenant.
   */
  async getTenantLicense(tenantId: string): Promise<LicenseResponse | null> {
    const license = await this.prisma.licenseKey.findFirst({
      where: { tenantId, status: LicenseStatus.ACTIVE },
      orderBy: { activatedAt: 'desc' },
    });
    return license ? this.toLicenseResponse(license) : null;
  }

  /**
   * revokeLicense
   * ─────────────
   * Thu hồi license (admin).
   */
  async revokeLicense(licenseId: string): Promise<LicenseResponse> {
    const license = await this.prisma.licenseKey.findUnique({
      where: { id: licenseId },
    });
    if (!license) {
      throw new NotFoundException('License không tồn tại.');
    }
    if (license.status === LicenseStatus.REVOKED) {
      throw new BadRequestException('License đã bị thu hồi trước đó.');
    }

    const updated = await this.prisma.licenseKey.update({
      where: { id: licenseId },
      data: { status: LicenseStatus.REVOKED },
    });

    return this.toLicenseResponse(updated);
  }

  /**
   * createKeyString
   * ───────────────
   * Sinh mã key: AIFUT-XXXX-XXXX-XXXX-XXXX
   */
  private createKeyString(): string {
    const randomBytes = crypto.randomBytes(KEY_SEGMENTS * 2);
    const hex = randomBytes.toString('hex').toUpperCase();

    const segments: string[] = [];
    for (let i = 0; i < KEY_SEGMENTS; i++) {
      segments.push(
        hex.slice(i * KEY_SEGMENT_LENGTH, (i + 1) * KEY_SEGMENT_LENGTH),
      );
    }

    return `${KEY_PREFIX}-${segments.join('-')}`;
  }

  /**
   * toLicenseResponse
   * ─────────────────
   */
  private toLicenseResponse(license: {
    id: string;
    key: string;
    tier: LicenseTier;
    status: LicenseStatus;
    tenantId: string | null;
    maxUsers: number;
    maxWorkflows: number;
    features: Prisma.JsonValue;
    issuedTo: string | null;
    issuedEmail: string | null;
    issuedAt: Date;
    activatedAt: Date | null;
    expiresAt: Date | null;
  }): LicenseResponse {
    const now = new Date();
    const isExpired =
      license.expiresAt !== null && license.expiresAt < now;
    const daysRemaining = license.expiresAt
      ? Math.max(
          0,
          Math.floor(
            (license.expiresAt.getTime() - now.getTime()) / 86_400_000,
          ),
        )
      : null;

    return {
      id: license.id,
      key: license.key,
      tier: license.tier,
      status: isExpired ? 'EXPIRED' : license.status,
      tenantId: license.tenantId,
      maxUsers: license.maxUsers,
      maxWorkflows: license.maxWorkflows,
      features: (license.features as string[]) ?? [],
      issuedTo: license.issuedTo,
      issuedEmail: license.issuedEmail,
      issuedAt: license.issuedAt,
      activatedAt: license.activatedAt,
      expiresAt: license.expiresAt,
      isExpired,
      daysRemaining,
    };
  }
}
