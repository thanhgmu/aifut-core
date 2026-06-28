// ===================================================================
// marketplace-dependency.service.ts — Dependency Resolution Service
// Phase 4: Developer Sandbox Core + Marketplace Contract Depth
// Hỗ trợ In-Memory standalone mode + DB-backed
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

export interface DependencyInput {
  versionId: string;
  dependsOnId: string;
  constraint: string; // semver range, e.g. ">=1.0.0 <2.0.0"
  isOptional?: boolean;
}

export interface DependencyResponse {
  id: string;
  versionId: string;
  dependsOnId: string;
  constraint: string;
  isOptional: boolean;
  listingName?: string;
  listingVersion?: string;
}

export interface ResolvedNode {
  id: string;
  listingId: string;
  version: string;
  listingName?: string;
  constraint?: string;
  isOptional?: boolean;
  dependencies: ResolvedNode[];
}

export interface ResolutionResult {
  success: boolean;
  tree: ResolvedNode[];
  resolved: { listingId: string; version: string }[];
  warnings: string[];
  errors: string[];
}

// ── Semver range matching ─────────────────────────────────────────────

interface SemverParts {
  major: number;
  minor: number;
  patch: number;
}

function parseSemver(v: string): SemverParts {
  const parts = v.split('.');
  if (parts.length !== 3) return { major: 0, minor: 0, patch: 0 };
  return {
    major: parseInt(parts[0], 10) || 0,
    minor: parseInt(parts[1], 10) || 0,
    patch: parseInt(parts[2], 10) || 0,
  };
}

function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

/**
 * matchesConstraint
 * Kiểm tra version có thỏa mãn range constraint hay không.
 * Hỗ trợ: ">=X.Y.Z", "<=X.Y.Z", ">X.Y.Z", "<X.Y.Z", "=X.Y.Z", "X.Y.Z"
 * Kết hợp: ">=1.0.0 <2.0.0", "^1.0.0", "~1.0.0"
 */
export function matchesConstraint(
  version: string,
  constraint: string,
): boolean {
  const v = parseSemver(version);
  const trimmed = constraint.trim();

  // ^1.2.3 → >=1.2.3 <2.0.0 (compatible with major)
  if (trimmed.startsWith('^')) {
    const minVer = trimmed.slice(1);
    const min = parseSemver(minVer);
    return (
      compareSemver(version, minVer) >= 0 &&
      v.major === min.major
    );
  }

  // ~1.2.3 → >=1.2.3 <1.3.0 (approximately equivalent)
  if (trimmed.startsWith('~')) {
    const minVer = trimmed.slice(1);
    const min = parseSemver(minVer);
    return (
      compareSemver(version, minVer) >= 0 &&
      v.major === min.major &&
      v.minor === min.minor
    );
  }

  // Compound: ">=1.0.0 <2.0.0"
  const parts = trimmed.split(/\s+/);
  if (parts.length > 1) {
    return parts.every((p) => {
      if (p.startsWith('>=')) return compareSemver(version, p.slice(2)) >= 0;
      if (p.startsWith('<=')) return compareSemver(version, p.slice(2)) <= 0;
      if (p.startsWith('>')) return compareSemver(version, p.slice(1)) > 0;
      if (p.startsWith('<')) return compareSemver(version, p.slice(1)) < 0;
      if (p.startsWith('=')) return compareSemver(version, p.slice(1)) === 0;
      return compareSemver(version, p) === 0;
    });
  }

  // Single operator
  if (trimmed.startsWith('>=')) return compareSemver(version, trimmed.slice(2)) >= 0;
  if (trimmed.startsWith('<=')) return compareSemver(version, trimmed.slice(2)) <= 0;
  if (trimmed.startsWith('>')) return compareSemver(version, trimmed.slice(1)) > 0;
  if (trimmed.startsWith('<')) return compareSemver(version, trimmed.slice(1)) < 0;
  if (trimmed.startsWith('=')) return compareSemver(version, trimmed.slice(1)) === 0;

  // Exact match
  return version === trimmed;
}

// ── In-Memory store ──────────────────────────────────────────────────

interface MemoryDep {
  id: string;
  versionId: string;
  dependsOnId: string;
  constraint: string;
  isOptional: boolean;
  createdAt: Date;
}

class InMemoryDepStore {
  private deps: Map<string, MemoryDep> = new Map();

  create(data: MemoryDep) {
    this.deps.set(data.id, data);
    return data;
  }

  findById(id: string) {
    return this.deps.get(id) ?? null;
  }

  findByVersion(versionId: string): MemoryDep[] {
    return Array.from(this.deps.values()).filter(
      (d) => d.versionId === versionId,
    );
  }

  findDependents(dependsOnId: string): MemoryDep[] {
    return Array.from(this.deps.values()).filter(
      (d) => d.dependsOnId === dependsOnId,
    );
  }

  findByVersionAndDependency(
    versionId: string,
    dependsOnId: string,
  ): MemoryDep | null {
    for (const d of this.deps.values()) {
      if (d.versionId === versionId && d.dependsOnId === dependsOnId) return d;
    }
    return null;
  }

  delete(id: string) {
    this.deps.delete(id);
  }

  all(): MemoryDep[] {
    return Array.from(this.deps.values());
  }
}

// ── In-Memory version store (shared reference) ──────────────────────

interface MemoryVersion {
  id: string;
  listingId: string;
  version: string;
  status: string;
}

// Global shared memory for cross-service consistency
const GLOBAL_VERSIONS = new Map<string, MemoryVersion>();
const GLOBAL_DEPS = new Map<string, MemoryDep>();

// ── Service ────────────────────────────────────────────────────────────

@Injectable()
export class MarketplaceDependencyService {
  private depStore = new InMemoryDepStore();
  private useMemory = false;

  constructor(
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.useMemory = !prisma;
  }

  setInMemoryMode(val: boolean) {
    this.useMemory = val;
  }

  registerVersion(id: string, listingId: string, version: string) {
    GLOBAL_VERSIONS.set(id, { id, listingId, version, status: 'ACTIVE' });
  }

  // ── Add dependency ─────────────────────────────────────────────

  async addDependency(input: DependencyInput): Promise<DependencyResponse> {
    // Validate version tồn tại
    await this.ensureVersionExists(input.versionId);
    await this.ensureVersionExists(input.dependsOnId);

    // Không tự dependency vào chính mình
    if (input.versionId === input.dependsOnId) {
      throw new BadRequestException('A version cannot depend on itself.');
    }

    // Check unique
    if (this.useMemory) {
      const existing = this.depStore.findByVersionAndDependency(
        input.versionId,
        input.dependsOnId,
      );
      if (existing) {
        throw new ConflictException(
          'This dependency already exists for this version.',
        );
      }
    } else {
      const existing = await this.prisma!.marketplaceDependency.findUnique({
        where: {
          versionId_dependsOnId: {
            versionId: input.versionId,
            dependsOnId: input.dependsOnId,
          },
        },
      });
      if (existing) {
        throw new ConflictException(
          'This dependency already exists for this version.',
        );
      }
    }

    // Validate constraint format
    if (!input.constraint || input.constraint.trim().length === 0) {
      throw new BadRequestException('Dependency constraint is required.');
    }

    if (this.useMemory) {
      const id = crypto.randomUUID();
      const dep: MemoryDep = {
        id,
        versionId: input.versionId,
        dependsOnId: input.dependsOnId,
        constraint: input.constraint.trim(),
        isOptional: input.isOptional ?? false,
        createdAt: new Date(),
      };
      this.depStore.create(dep);

      // Check for cycles after adding
      const cycleCheck = await this.detectCycles(input.versionId);
      if (cycleCheck.hasCycle) {
        this.depStore.delete(id);
        throw new BadRequestException(
          `Adding this dependency creates a cycle: ${cycleCheck.path.join(' → ')}`,
        );
      }

      return this.toDepResponse(dep);
    }

    // Check cycles in DB mode
    const cycleCheck = await this.detectCycles(input.versionId);
    if (cycleCheck.hasCycle) {
      throw new BadRequestException(
        `Adding this dependency creates a cycle: ${cycleCheck.path.join(' → ')}`,
      );
    }

    const dep = await this.prisma!.marketplaceDependency.create({
      data: {
        versionId: input.versionId,
        dependsOnId: input.dependsOnId,
        constraint: input.constraint.trim(),
        isOptional: input.isOptional ?? false,
      },
    });

    return this.toDepResponse(dep);
  }

  // ── Remove dependency ───────────────────────────────────────────

  async removeDependency(dependencyId: string): Promise<void> {
    if (this.useMemory) {
      const dep = this.depStore.findById(dependencyId);
      if (!dep) {
        throw new NotFoundException(
          `Dependency "${dependencyId}" not found.`,
        );
      }
      this.depStore.delete(dependencyId);
      return;
    }

    const dep = await this.prisma!.marketplaceDependency.findUnique({
      where: { id: dependencyId },
    });
    if (!dep) {
      throw new NotFoundException(
        `Dependency "${dependencyId}" not found.`,
      );
    }

    await this.prisma!.marketplaceDependency.delete({
      where: { id: dependencyId },
    });
  }

  // ── Get dependencies for a version ─────────────────────────────

  async getDependencies(
    versionId: string,
  ): Promise<DependencyResponse[]> {
    await this.ensureVersionExists(versionId);

    if (this.useMemory) {
      const deps = this.depStore.findByVersion(versionId);
      return deps.map((d) => this.toDepResponse(d));
    }

    const deps = await this.prisma!.marketplaceDependency.findMany({
      where: { versionId },
      include: {
        dependsOn: {
          select: { version: true },
        },
      },
    });

    return deps.map((d) => ({
      id: d.id,
      versionId: d.versionId,
      dependsOnId: d.dependsOnId,
      constraint: d.constraint,
      isOptional: d.isOptional,
      listingVersion: (d.dependsOn as any)?.version ?? undefined,
    }));
  }

  // ── Get dependency tree ────────────────────────────────────────

  async getDependencyTree(
    versionId: string,
  ): Promise<ResolvedNode> {
    await this.ensureVersionExists(versionId);

    const visited = new Set<string>();
    const buildTree = async (
      vid: string,
      depth: number = 0,
    ): Promise<ResolvedNode> => {
      if (depth > 50) {
        return {
          id: vid,
          listingId: '',
          version: 'DEPTH_LIMIT',
          dependencies: [],
        };
      }

      visited.add(vid);

      let versionInfo: { listingId: string; version: string } | null = null;
      if (this.useMemory) {
        const gv = GLOBAL_VERSIONS.get(vid) ?? null;
        versionInfo = gv ? { listingId: gv.listingId, version: gv.version } : null;
      } else {
        const dbV = await this.prisma!.marketplaceVersion.findUnique({
          where: { id: vid },
          select: { listingId: true, version: true },
        });
        versionInfo = dbV;
      }

      const deps = this.useMemory
        ? this.depStore.findByVersion(vid)
        : await this.prisma!.marketplaceDependency.findMany({
            where: { versionId: vid },
          });

      const children: ResolvedNode[] = [];
      for (const dep of deps) {
        if (visited.has(dep.dependsOnId)) {
          // Cycle detected — skip in tree but mark
          children.push({
            id: dep.dependsOnId,
            listingId: '',
            version: 'CYCLE (already visited)',
            dependencies: [],
            constraint: dep.constraint,
            isOptional: dep.isOptional,
          });
          continue;
        }
        const child = await buildTree(dep.dependsOnId, depth + 1);
        child.constraint = dep.constraint;
        child.isOptional = dep.isOptional;
        children.push(child);
      }

      return {
        id: vid,
        listingId: versionInfo?.listingId ?? '',
        version: versionInfo?.version ?? 'unknown',
        dependencies: children,
      };
    };

    return buildTree(versionId);
  }

  // ── Resolve all dependencies (resolution target) ───────────────

  async resolveDependencies(
    versionId: string,
  ): Promise<ResolutionResult> {
    const warnings: string[] = [];
    const errors: string[] = [];
    const resolved: Map<string, string> = new Map(); // listingId → version
    const visited = new Set<string>();

    const resolve = async (
      vid: string,
      parentConstraint?: string,
      depth: number = 0,
    ): Promise<void> => {
      if (depth > 50) {
        errors.push(`Dependency depth exceeds 50 at version "${vid}".`);
        return;
      }

      if (visited.has(vid)) return;
      visited.add(vid);

      let versionInfo: {
        id: string;
        listingId: string;
        version: string;
      } | null = null;

      if (this.useMemory) {
        const gv = GLOBAL_VERSIONS.get(vid) ?? null;
        if (gv) versionInfo = gv;
      } else {
        const dbV = await this.prisma!.marketplaceVersion.findUnique({
          where: { id: vid },
          select: { id: true, listingId: true, version: true },
        });
        versionInfo = dbV;
      }

      if (!versionInfo) {
        errors.push(`Version "${vid}" not found.`);
        return;
      }

      // Check if this listingId already resolved to a different version
      const existing = resolved.get(versionInfo.listingId);
      if (existing && existing !== versionInfo.version) {
        // Conflict if both constraints can't be satisfied
        if (
          parentConstraint &&
          !matchesConstraint(existing, parentConstraint)
        ) {
          errors.push(
            `CONFLICT: "${versionInfo.listingId}" requires version ${versionInfo.version} but already resolved to ${existing} (constraint: ${parentConstraint}).`,
          );
        }
        // Skip processing children if already resolved
        return;
      }
      resolved.set(versionInfo.listingId, versionInfo.version);

      // Get dependencies
      const deps = this.useMemory
        ? this.depStore.findByVersion(vid)
        : await this.prisma!.marketplaceDependency.findMany({
            where: { versionId: vid },
          });

      for (const dep of deps) {
        // Check optional deps
        if (dep.isOptional) {
          warnings.push(
            `Optional dependency "${dep.dependsOnId}" skipped during resolution.`,
          );
          continue;
        }

        // Resolve to a version satisfying constraint
        const resolvedVersion = await this.resolveConstrainedVersion(
          dep.dependsOnId,
          dep.constraint,
        );
        if (!resolvedVersion) {
          errors.push(
            `Cannot resolve "${dep.dependsOnId}" with constraint "${dep.constraint}".`,
          );
          continue;
        }

        // Check conflict
        const depListingId = resolvedVersion.listingId;
        const existingVer = resolved.get(depListingId);
        if (existingVer && existingVer !== resolvedVersion.version) {
          if (!matchesConstraint(existingVer, dep.constraint)) {
            errors.push(
              `CONFLICT: "${depListingId}" needs ${resolvedVersion.version} but ${existingVer} already resolved (constraint: ${dep.constraint}).`,
            );
          }
          continue;
        }
        resolved.set(depListingId, resolvedVersion.version);

        // Recurse into dependencies of the resolved dependency
        await resolve(resolvedVersion.id, dep.constraint, depth + 1);
      }
    };

    await resolve(versionId);

    return {
      success: errors.length === 0,
      tree: [], // Full tree via getDependencyTree
      resolved: Array.from(resolved.entries()).map(([listingId, version]) => ({
        listingId,
        version,
      })),
      warnings,
      errors,
    };
  }

  // ── Cycle detection ────────────────────────────────────────────

  async detectCycles(
    startVersionId: string,
  ): Promise<{ hasCycle: boolean; path: string[] }> {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = async (vid: string): Promise<boolean> => {
      visited.add(vid);
      recursionStack.add(vid);
      path.push(vid);

      const deps = this.useMemory
        ? this.depStore.findByVersion(vid)
        : await this.prisma!.marketplaceDependency.findMany({
            where: { versionId: vid },
          });

      for (const dep of deps) {
        if (!visited.has(dep.dependsOnId)) {
          if (await dfs(dep.dependsOnId)) return true;
        } else if (recursionStack.has(dep.dependsOnId)) {
          path.push(dep.dependsOnId);
          return true;
        }
      }

      recursionStack.delete(vid);
      path.pop();
      return false;
    };

    const hasCycle = await dfs(startVersionId);
    return { hasCycle, path };
  }

  // ── Get topological install order ──────────────────────────────

  async resolveInstallOrder(
    versionIds: string[],
  ): Promise<{ order: string[]; errors: string[] }> {
    const errors: string[] = [];
    const visited = new Set<string>();
    const result: string[] = [];
    const inProgress = new Set<string>();

    const visit = async (vid: string, path: string[]): Promise<void> => {
      if (inProgress.has(vid)) {
        errors.push(
          `Cycle detected: ${path.join(' → ')} → ${vid}`,
        );
        return;
      }
      if (visited.has(vid)) return;

      inProgress.add(vid);
      path.push(vid);

      const deps = this.useMemory
        ? this.depStore.findByVersion(vid)
        : await this.prisma!.marketplaceDependency.findMany({
            where: { versionId: vid, isOptional: false },
          });

      for (const dep of deps) {
        await visit(dep.dependsOnId, [...path]);
      }

      inProgress.delete(vid);
      visited.add(vid);
      result.push(vid);
    };

    for (const vid of versionIds) {
      await visit(vid, []);
    }

    return { order: result, errors };
  }

  // ── Private helpers ─────────────────────────────────────────────

  private async ensureVersionExists(versionId: string): Promise<void> {
    if (this.useMemory) {
      if (!GLOBAL_VERSIONS.has(versionId)) {
        throw new NotFoundException(
          `MarketplaceVersion "${versionId}" not found.`,
        );
      }
      return;
    }

    const v = await this.prisma!.marketplaceVersion.findUnique({
      where: { id: versionId },
      select: { id: true },
    });
    if (!v) {
      throw new NotFoundException(
        `MarketplaceVersion "${versionId}" not found.`,
      );
    }
  }

  private async resolveConstrainedVersion(
    versionId: string,
    constraint: string,
  ): Promise<{ id: string; listingId: string; version: string } | null> {
    // Get base info
    let base: { id: string; listingId: string; version: string } | null = null;

    if (this.useMemory) {
      const gv = GLOBAL_VERSIONS.get(versionId) ?? null;
      if (gv) base = gv;
    } else {
      const dbV = await this.prisma!.marketplaceVersion.findUnique({
        where: { id: versionId },
        select: { id: true, listingId: true, version: true },
      });
      base = dbV;
    }

    if (!base) return null;

    // If the version itself matches the constraint, use it
    if (matchesConstraint(base.version, constraint)) {
      return base;
    }

    // Try to find another version of the same listing that matches
    if (this.useMemory) return base; // Simplified in memory mode

    const listingVersions = await this.prisma!.marketplaceVersion.findMany({
      where: { listingId: base.listingId, status: 'ACTIVE' },
      orderBy: { publishedAt: 'desc' },
    });

    for (const lv of listingVersions) {
      if (matchesConstraint(lv.version, constraint)) {
        return {
          id: lv.id,
          listingId: lv.listingId,
          version: lv.version,
        };
      }
    }

    return null;
  }

  private toDepResponse(d: MemoryDep | any): DependencyResponse {
    return {
      id: d.id,
      versionId: d.versionId,
      dependsOnId: d.dependsOnId,
      constraint: d.constraint,
      isOptional: d.isOptional ?? false,
    };
  }
}
