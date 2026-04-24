import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipRole } from '@prisma/client';
import { CredentialReferencesService } from './credential-references.service';
import { AccessPolicyService } from './access-policy.service';

describe('CredentialReferencesService', () => {
  let service: CredentialReferencesService;
  let accessPolicy: { resolveAndRequire: jest.Mock };

  beforeEach(async () => {
    accessPolicy = {
      resolveAndRequire: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CredentialReferencesService,
        { provide: AccessPolicyService, useValue: accessPolicy },
      ],
    }).compile();

    service = module.get<CredentialReferencesService>(CredentialReferencesService);
  });

  it('should build a preview-ready tenant credential reference when policy allows it', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        activeWorkspace: { id: 'ws_1', slug: 'ops' },
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });

    const result = await service.previewReference({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      userEmail: 'ops@acme.test',
      connectorKey: 'n8n',
      ownershipMode: 'tenant-provided',
      packagePolicy: {
        allowTenantExternalCredentials: true,
        allowPlatformBrokeredCredentials: false,
      },
    });

    expect(result).toMatchObject({
      status: 'preview-ready',
      reference: {
        value: 'tenant:n8n:primary',
        ownershipMode: 'tenant-provided',
      },
      governance: {
        allowed: true,
      },
    });
  });

  it('should block brokered references when package policy forbids them', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        activeWorkspace: null,
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });

    const result = await service.previewReference({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      connectorKey: 'n8n',
      ownershipMode: 'platform-provided',
      packagePolicy: {
        allowTenantExternalCredentials: true,
        allowPlatformBrokeredCredentials: false,
      },
    });

    expect(result).toMatchObject({
      status: 'blocked',
      governance: {
        allowed: false,
        blockedReason:
          'Package policy does not allow platform or affiliate brokered credentials.',
      },
    });
  });

  it('should reject unsupported auth modes', async () => {
    accessPolicy.resolveAndRequire.mockResolvedValue({
      context: {
        tenant: { id: 'tenant_1', slug: 'acme' },
        activeWorkspace: null,
        activeMembership: { role: MembershipRole.OPERATOR },
      },
    });

    await expect(
      service.previewReference({
        tenantSlug: 'acme',
        userEmail: 'ops@acme.test',
        connectorKey: 'n8n',
        authMode: 'magic-link',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
