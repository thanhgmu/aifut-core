import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';

type ResolveHostnameInput = {
  hostname?: string;
  workspaceSlug?: string;
};

@Injectable()
export class TenantDomainResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveHostname(input: ResolveHostnameInput) {
    const hostname = this.normalizeHostname(input.hostname);
    const workspaceSlug = input.workspaceSlug?.trim().toLowerCase();

    if (!hostname) {
      throw new BadRequestException(
        'Missing hostname. Provide x-forwarded-host, host header, or hostname query param.',
      );
    }

    const domain = await this.prisma.tenantDomain.findUnique({
      where: { hostname },
      select: {
        id: true,
        hostname: true,
        kind: true,
        status: true,
        isPrimary: true,
        workspaceId: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
          },
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!domain) {
      throw new NotFoundException(`Tenant domain not found for hostname: ${hostname}`);
    }

    const resolvedWorkspace =
      workspaceSlug && domain.workspace?.slug !== workspaceSlug
        ? null
        : domain.workspace;

    return {
      hostname,
      domain: {
        id: domain.id,
        hostname: domain.hostname,
        kind: domain.kind,
        status: domain.status,
        isPrimary: domain.isPrimary,
      },
      tenant: domain.tenant,
      workspace: resolvedWorkspace,
      resolution: {
        hostname,
        workspaceSlug: workspaceSlug ?? null,
        matchedWorkspaceFromDomain: Boolean(domain.workspace),
        workspaceSlugMatchedDomain: workspaceSlug
          ? domain.workspace?.slug === workspaceSlug
          : Boolean(domain.workspace),
      },
      next: [
        'host-header-tenant-resolution',
        'workspace-domain-binding-guardrails',
        'edge-routing-enforcement',
      ],
    };
  }

  private normalizeHostname(hostname?: string) {
    return hostname
      ?.trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      ?.split(':')[0];
  }
}
