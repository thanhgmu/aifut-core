import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { evaluateTenantDomainReadiness } from './tenant-domain-readiness';

type ResolveHostnameInput = {
  hostname?: string;
  workspaceSlug?: string;
  enforceWorkspaceMatch?: boolean;
};

@Injectable()
export class TenantDomainResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveHostname(input: ResolveHostnameInput) {
    const hostname = this.normalizeHostname(input.hostname);
    const workspaceSlug = input.workspaceSlug?.trim().toLowerCase();
    const enforceWorkspaceMatch = input.enforceWorkspaceMatch ?? false;

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
        provider: true,
        provisioningMode: true,
        dnsTarget: true,
        certificateStatus: true,
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

    if (
      enforceWorkspaceMatch &&
      workspaceSlug &&
      domain.workspace?.slug &&
      domain.workspace.slug !== workspaceSlug
    ) {
      throw new ForbiddenException(
        `Hostname ${hostname} is bound to workspace ${domain.workspace.slug}, not ${workspaceSlug}.`,
      );
    }

    const resolvedWorkspace =
      workspaceSlug && domain.workspace?.slug !== workspaceSlug
        ? null
        : domain.workspace;

    const bindingScope = domain.workspace ? 'workspace' : 'tenant';
    const workspaceMismatchDetected = Boolean(
      workspaceSlug &&
      domain.workspace?.slug &&
      domain.workspace.slug !== workspaceSlug,
    );
    const workspaceRequestDisposition = workspaceSlug
      ? domain.workspace?.slug === workspaceSlug
        ? 'matched'
        : enforceWorkspaceMatch
          ? 'blocked'
          : 'workspace-request-mismatch'
      : domain.workspace
        ? 'implicit-domain-workspace'
        : 'tenant-default';

    const runtimeRouting = evaluateTenantDomainReadiness(domain);

    return {
      hostname,
      domain: {
        id: domain.id,
        hostname: domain.hostname,
        kind: domain.kind,
        status: domain.status,
        isPrimary: domain.isPrimary,
        provider: domain.provider,
        provisioningMode: domain.provisioningMode,
        dnsTarget: domain.dnsTarget,
        certificateStatus: domain.certificateStatus,
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
        enforceWorkspaceMatch,
      },
      governance: {
        bindingScope,
        workspaceRequestDisposition,
        workspaceRouting: {
          requestedWorkspaceSlug: workspaceSlug ?? null,
          boundWorkspaceSlug: domain.workspace?.slug ?? null,
          effectiveWorkspaceSlug: resolvedWorkspace?.slug ?? null,
          mismatchDetected: workspaceMismatchDetected,
        },
        runtimeRouting,
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
