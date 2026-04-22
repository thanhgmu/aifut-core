import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { AccessPolicyService } from './access-policy.service';
import { CONNECTOR_REGISTRY_FOUNDATION } from './connectors.constants';

type CredentialReferenceInput = {
  tenantSlug?: string;
  workspaceSlug?: string;
  userEmail?: string;
  hostname?: string;
  connectorKey?: string;
  reference?: string;
  authMode?: string;
  ownershipMode?: 'platform-provided' | 'tenant-provided' | 'affiliate-provided';
  label?: string;
  packagePolicy?: {
    allowTenantExternalCredentials?: boolean;
    allowPlatformBrokeredCredentials?: boolean;
  };
};

@Injectable()
export class CredentialReferencesService {
  constructor(private readonly accessPolicy: AccessPolicyService) {}

  getBlueprint(connectorKey?: string) {
    const normalizedConnectorKey = connectorKey?.trim().toLowerCase();

    if (!normalizedConnectorKey) {
      throw new BadRequestException('Missing connectorKey.');
    }

    const connector = CONNECTOR_REGISTRY_FOUNDATION.find(
      (candidate) => candidate.key === normalizedConnectorKey,
    );

    if (!connector) {
      throw new NotFoundException(
        `Connector not found for key: ${normalizedConnectorKey}`,
      );
    }

    return {
      capability: 'integrations',
      surface: 'credential-reference-blueprint',
      connector: {
        key: connector.key,
        name: connector.name,
        authModes: connector.authModes,
        category: connector.category,
      },
      referenceContract: {
        pattern: '<owner>:<provider>:<key>',
        examples: [
          `tenant:${connector.key}:primary`,
          `platform:${connector.key}:brokered-default`,
          `affiliate:${connector.key}:reseller-pack-1`,
        ],
        ownershipModes: [
          'platform-provided',
          'tenant-provided',
          'affiliate-provided',
        ],
      },
      governance: {
        packageControls: [
          'allow-tenant-external-credentials',
          'allow-platform-brokered-credentials',
        ],
        visibilityTargets: ['operator-panel', 'tenant-panel'],
      },
      next: [
        'attach-reference-to-connection',
        'verify-credential-reachability',
        'add-vault-backed-storage-later',
      ],
    };
  }

  async previewReference(input: CredentialReferenceInput) {
    const resolved = await this.accessPolicy.resolveAndRequire(
      {
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug,
        userEmail: input.userEmail,
        hostname: input.hostname,
        enforceWorkspaceDomainMatch: true,
      },
      {
        minimumRole: MembershipRole.OPERATOR,
        scope: 'operator-control',
      },
    );

    const connectorKey = input.connectorKey?.trim().toLowerCase();
    const connector = connectorKey
      ? CONNECTOR_REGISTRY_FOUNDATION.find((candidate) => candidate.key === connectorKey)
      : null;

    if (!connectorKey || !connector) {
      throw new NotFoundException(`Connector not found for key: ${connectorKey}`);
    }

    const normalizedReference = this.normalizeReference(
      input.reference,
      input.ownershipMode,
      connectorKey,
    );
    const ownershipMode = input.ownershipMode ?? 'tenant-provided';
    const authMode = this.pickAuthMode({
      requested: input.authMode,
      supported: connector.authModes,
    });
    const governance = this.evaluateGovernance({
      ownershipMode,
      packagePolicy: input.packagePolicy,
    });

    return {
      capability: 'integrations',
      surface: 'credential-reference-preview',
      status: governance.allowed ? 'preview-ready' : 'blocked',
      tenant: resolved.context.tenant,
      workspace: resolved.context.activeWorkspace,
      connector: {
        key: connector.key,
        name: connector.name,
        authModes: connector.authModes,
      },
      reference: {
        value: normalizedReference,
        ownershipMode,
        authMode,
        label: input.label?.trim() || null,
        visibility: {
          operatorPanel: true,
          tenantPanel: ownershipMode !== 'platform-provided',
        },
      },
      governance,
      next: governance.allowed
        ? ['attach-reference-to-connection', 'run-verification-check']
        : ['adjust-package-policy', 'switch-reference-ownership-mode'],
    };
  }

  private normalizeReference(
    reference: string | undefined,
    ownershipMode: CredentialReferenceInput['ownershipMode'],
    connectorKey: string,
  ) {
    const normalized = reference?.trim().toLowerCase();

    if (normalized) {
      if (!/^[a-z0-9._:-]+$/i.test(normalized)) {
        throw new BadRequestException('Invalid credential reference format.');
      }

      return normalized;
    }

    const ownerPrefix =
      ownershipMode === 'platform-provided'
        ? 'platform'
        : ownershipMode === 'affiliate-provided'
          ? 'affiliate'
          : 'tenant';

    return `${ownerPrefix}:${connectorKey}:primary`;
  }

  private pickAuthMode(input: { requested?: string; supported: readonly string[] }) {
    const requested = input.requested?.trim().toLowerCase();

    if (!requested) {
      return input.supported[0] ?? 'custom';
    }

    if (!input.supported.includes(requested)) {
      throw new BadRequestException(
        `Unsupported authMode ${requested}. Supported: ${input.supported.join(', ')}`,
      );
    }

    return requested;
  }

  private evaluateGovernance(input: {
    ownershipMode: NonNullable<CredentialReferenceInput['ownershipMode']>;
    packagePolicy?: CredentialReferenceInput['packagePolicy'];
  }) {
    const allowTenantExternalCredentials =
      input.packagePolicy?.allowTenantExternalCredentials ?? true;
    const allowPlatformBrokeredCredentials =
      input.packagePolicy?.allowPlatformBrokeredCredentials ?? true;

    const blockedReason =
      input.ownershipMode === 'tenant-provided' && !allowTenantExternalCredentials
        ? 'Package policy does not allow tenant-provided external credentials.'
        : input.ownershipMode !== 'tenant-provided' &&
            !allowPlatformBrokeredCredentials
          ? 'Package policy does not allow platform or affiliate brokered credentials.'
          : null;

    return {
      allowed: blockedReason === null,
      packagePolicy: {
        allowTenantExternalCredentials,
        allowPlatformBrokeredCredentials,
      },
      blockedReason,
    };
  }
}
