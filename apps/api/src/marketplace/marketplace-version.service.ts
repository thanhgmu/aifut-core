// ===================================================================
// marketplace-version.service.ts — Marketplace Versioning Service
// Phase 4: Developer Sandbox Core + Marketplace Contract Depth
// In-Memory-First — hỗ trợ standalone mode (không cần DB)
// ===================================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// ── Types ──────────────────────────────────────────────────────────────

export interface VersionResponse {
  id: string;
  listingId: string;
  version: string;
  changelog?: string;
  config?: any;
  status: 'ACTIVE' | 'DEPRECATED' | 'SUPERSEDED';
  publishedAt: Date;
  dependencyCount: number;
}

export interface PublishVersionInput {
  listingId: string;
  version: string;
  changelog?: string;
  config?: any;
}

export interface VersionHistoryResponse {
  versions: VersionResponse[];
  total: number;
}

// ── In-Memory store ──────────────────────────────────────────────────

interface MemoryVersion {
  id: string;
  listingId: string;
  version: string;
  changelog?: string;
  config?: any;
  status: 'ACTIVE' | 'DEPRECATED' | 'SUPERSEDED';
  publishedAt: Date;
}

class InMemoryVersionStore {
  private versions: Map<string, MemoryVersion> = new Map();

  create(data: MemoryVersion) {
    this.versions.set(data.id, data);
    return data;
  }

  findById(id: string) {
    return this.versions.get(id) ?? null;
  }

  findByListingAndVersion(listingId: string, version: string) {
    for (const v of this.versions.values()) {
      if (v.listingId === listingId && v.version === version) {
        return v;
      }
    }
    return null;
  }

  findByListing(listingId: string): MemoryVersion[] {
    return Array.from(this.versions.values())
      .filter((v) => v.listingId === listingId)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  }

  updateStatus(id: string, status: 'ACTIVE' | 'DEPRECATED' | 'SUPERSEDED') {
    const v = this.versions.get(id);
    if (v) {
      v.status = status;
      this.versions.set(id, v);
    }
    return v;
  }

  countByListing(listingId: string): number {
    let count = 0;
    for (const v of this.versions.values()) {
      if (v.listingId === listingId) count++;
    }
    return count;
  }
}

// ── Semver helpers ───────────────────────────────────────────────────

interface SemverParts {
  major: number;
  minor: number;
  patch: number;
}

function parseSemver(v: string): SemverParts {
  const parts = v.split('.');
  if (parts.length !== 3) {
    throw new BadRequestException(
      `Invalid semver "${v}". Expected MAJOR.MINOR.PATCH format.`,
    );
  }
  const [major, minor, patch] = parts.map((p) => {
    const n = parseInt(p, 10);
    if (isNaN(n) || n < 0) {
      throw new BadRequestException(
        `Invalid semver part "${p}" in "${v}". Must be non-negative integer.`,
      );
    }
    return n;
  });
  return { major, minor, patch };
}

function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

function incrementSemver(
  current: string,
  bump: 'MAJOR' | 'MINOR' | 'PATCH',
): string {
  const p = parseSemver(current);
  switch (bump) {
    case 'MAJOR':
      return `${p.major + 1}.0.0`;
    case 'MINOR':
      return `${p.major}.${p.minor + 1}.0`;
    case 'PATCH':
      return `${p.major}.${p.minor}.${p.patch + 1}`;
  }
}

// ── Service ────────────────────────────────────────────────────────────

@Injectable()
export class MarketplaceVersionService {
  private memoryStore = new InMemoryVersionStore();
  private useMemory = false;

  constructor(
    @Optional() private readonly prisma?: PrismaService,
  ) {
    // Auto-detect: nếu Prisma unavailable → chạy in-memory
    this.useMemory = !prisma;
  }

  /**
   * setInMemoryMode
   * Cho phép force in-memory mode (standalone / testing)
   */
  setInMemoryMode(val: boolean) {
    this.useMemory = val;
  }

  // ── Publish new version ─────────────────────────────────────────

  /**
   * publishVersion
   * Tạo version mới cho một marketplace listing.
   * - Tự động kiểm tra listing tồn tại
   * - Semver validation + uniqueness check (mỗi listing chỉ 1 version/string)
   * - Nếu version < active version → reject
   * - Previous active version → SUPERSEDED
   */
  async publishVersion(
    input: PublishVersionInput,
  ): Promise<VersionResponse> {
    // Validate semver
    parseSemver(input.version);

    // Kiểm tra listing tồn tại
    await this.ensureListingExists(input.listingId);

    // Check uniqueness: không trùng version cho cùng listing
    if (this.useMemory) {
      const existing = this.memoryStore.findByListingAndVersion(
        input.listingId,
        input.version,
      );
      if (existing) {
        throw new ConflictException(
          `Version "${input.version}" already exists for listing "${input.listingId}".`,
        );
      }
    } else {
      const existing = await this.prisma!.marketplaceVersion.findUnique({
        where: {
          listingId_version: {
            listingId: input.listingId,
            version: input.version,
          },
        },
      });
      if (existing) {
        throw new ConflictException(
          `Version "${input.version}" already exists for listing "${input.listingId}".`,
        );
      }
    }

    // Check version ordering: không cho publish version < active
    const activeVersion = await this.getActiveVersion(input.listingId);
    if (activeVersion && compareSemver(input.version, activeVersion.version) <= 0) {
      throw new BadRequestException(
        `New version "${input.version}" must be greater than active version "${activeVersion.version}".`,
      );
    }

    if (this.useMemory) {
      // Supersede current active
      const active = this.memoryStore.findByListingAndVersion(
        input.listingId,
        activeVersion?.version ?? '',
      );
      if (active) {
        this.memoryStore.updateStatus(active.id, 'SUPERSEDED');
      }

      // Create new version
      const id = crypto.randomUUID();
      const created: MemoryVersion = {
        id,
        listingId: input.listingId,
        version: input.version,
        changelog: input.changelog,
        config: input.config ?? null,
        status: 'ACTIVE',
        publishedAt: new Date(),
      };
      this.memoryStore.create(created);

      // Update listing.version field
      await this.updateListingVersion(input.listingId, input.version);

      return this.toVersionResponse(created);
    }

    // DB path
    const active = await this.prisma!.marketplaceVersion.findFirst({
      where: { listingId: input.listingId, status: 'ACTIVE' },
    });
    if (active) {
      await this.prisma!.marketplaceVersion.update({
        where: { id: active.id },
        data: { status: 'SUPERSEDED' },
      });
    }

    const created = await this.prisma!.marketplaceVersion.create({
      data: {
        listingId: input.listingId,
        version: input.version,
        changelog: input.changelog,
        config: input.config ?? undefined,
        status: 'ACTIVE',
      },
    });

    await this.updateListingVersion(input.listingId, input.version);

    return this.toVersionResponse(created);
  }

  // ── Get version history ────────────────────────────────────────

  /**
   * getVersionHistory
   * Danh sách tất cả version của một listing, sắp xếp mới nhất lên đầu.
   */
  async getVersionHistory(listingId: string): Promise<VersionHistoryResponse> {
    await this.ensureListingExists(listingId);

    let versions: VersionResponse[];

    if (this.useMemory) {
      const memVersions = this.memoryStore.findByListing(listingId);
      versions = memVersions.map((v) => ({
        ...this.toVersionResponse(v),
        dependencyCount: 0, // Dependencies tracked in separate service
      }));
    } else {
      const dbVersions = await this.prisma!.marketplaceVersion.findMany({
        where: { listingId },
        orderBy: { publishedAt: 'desc' },
      });
      versions = await Promise.all(
        dbVersions.map(async (v) => {
          const depCount = await this.prisma!.marketplaceDependency.count({
            where: { versionId: v.id },
          });
          return {
            id: v.id,
            listingId: v.listingId,
            version: v.version,
            changelog: v.changelog ?? undefined,
            config: v.config ?? undefined,
            status: v.status as any,
            publishedAt: v.publishedAt,
            dependencyCount: depCount,
          };
        }),
      );
    }

    return { versions, total: versions.length };
  }

  // ── Get active version ─────────────────────────────────────────

  /**
   * getActiveVersion
   * Version đang ACTIVE của một listing.
   */
  async getActiveVersion(
    listingId: string,
  ): Promise<VersionResponse | null> {
    await this.ensureListingExists(listingId);

    if (this.useMemory) {
      const versions = this.memoryStore.findByListing(listingId);
      const active = versions.find((v) => v.status === 'ACTIVE');
      return active ? this.toVersionResponse(active) : null;
    }

    const active = await this.prisma!.marketplaceVersion.findFirst({
      where: { listingId, status: 'ACTIVE' },
    });
    if (!active) return null;

    const depCount = await this.prisma!.marketplaceDependency.count({
      where: { versionId: active.id },
    });

    return {
      id: active.id,
      listingId: active.listingId,
      version: active.version,
      changelog: active.changelog ?? undefined,
      config: active.config ?? undefined,
      status: active.status as any,
      publishedAt: active.publishedAt,
      dependencyCount: depCount,
    };
  }

  // ── Deprecate version ──────────────────────────────────────────

  /**
   * deprecateVersion
   * Đánh dấu version = DEPRECATED (không còn recommend cho new installs).
   */
  async deprecateVersion(versionId: string): Promise<VersionResponse> {
    if (this.useMemory) {
      const v = this.memoryStore.findById(versionId);
      if (!v) {
        throw new NotFoundException(`Version "${versionId}" not found.`);
      }
      this.memoryStore.updateStatus(versionId, 'DEPRECATED');

      // Check if there's a newer ACTIVE version
      const listingVersions = this.memoryStore.findByListing(v.listingId);
      const newerActive = listingVersions.find(
        (lv) =>
          lv.status === 'ACTIVE' &&
          compareSemver(lv.version, v.version) > 0,
      );
      if (!newerActive) {
        // Find the next best version to activate (newest non-deprecated)
        const next = listingVersions
          .filter((lv) => lv.id !== versionId && lv.status !== 'DEPRECATED')
          .sort((a, b) => compareSemver(b.version, a.version))[0];
        if (next) {
          this.memoryStore.updateStatus(next.id, 'ACTIVE');
        }
      }

      return this.toVersionResponse(this.memoryStore.findById(versionId)!);
    }

    const v = await this.prisma!.marketplaceVersion.findUnique({
      where: { id: versionId },
    });
    if (!v) {
      throw new NotFoundException(`Version "${versionId}" not found.`);
    }

    const updated = await this.prisma!.marketplaceVersion.update({
      where: { id: versionId },
      data: { status: 'DEPRECATED' },
    });

    // Auto-activate next newest version if no ACTIVE remains
    const activeCount = await this.prisma!.marketplaceVersion.count({
      where: { listingId: v.listingId, status: 'ACTIVE' },
    });
    if (activeCount === 0) {
      const next = await this.prisma!.marketplaceVersion.findFirst({
        where: {
          listingId: v.listingId,
          status: { not: 'DEPRECATED' },
        },
        orderBy: { publishedAt: 'desc' },
      });
      if (next) {
        await this.prisma!.marketplaceVersion.update({
          where: { id: next.id },
          data: { status: 'ACTIVE' },
        });
      }
    }

    const depCount = await this.prisma!.marketplaceDependency.count({
      where: { versionId: updated.id },
    });

    return {
      id: updated.id,
      listingId: updated.listingId,
      version: updated.version,
      changelog: updated.changelog ?? undefined,
      config: updated.config ?? undefined,
      status: updated.status as any,
      publishedAt: updated.publishedAt,
      dependencyCount: depCount,
    };
  }

  // ── Semantic helpers (exposed for other services) ──────────────

  compareVersions(a: string, b: string): number {
    return compareSemver(a, b);
  }

  incrementVersion(current: string, bump: 'MAJOR' | 'MINOR' | 'PATCH'): string {
    return incrementSemver(current, bump);
  }

  validateSemver(v: string): boolean {
    try {
      parseSemver(v);
      return true;
    } catch {
      return false;
    }
  }

  // ── Private helpers ─────────────────────────────────────────────

  private async ensureListingExists(listingId: string): Promise<void> {
    if (this.useMemory) return; // Assume listing exists in memory mode

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

  private async updateListingVersion(
    listingId: string,
    version: string,
  ): Promise<void> {
    if (this.useMemory) return;

    await this.prisma!.marketplaceListing.update({
      where: { id: listingId },
      data: { version },
    });
  }

  private toVersionResponse(v: MemoryVersion | any): VersionResponse {
    return {
      id: v.id,
      listingId: v.listingId,
      version: v.version,
      changelog: v.changelog ?? undefined,
      config: v.config ?? undefined,
      status: v.status,
      publishedAt: v.publishedAt,
      dependencyCount: 0,
    };
  }
}
