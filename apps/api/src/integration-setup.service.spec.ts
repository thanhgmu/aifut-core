import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InfrastructureProfileService } from './infrastructure-profile.service';
import { IntegrationSetupService } from './integration-setup.service';
import { StorageRoutingPolicyService } from './storage-routing-policy.service';

describe('IntegrationSetupService', () => {
  let service: IntegrationSetupService;
  let infrastructureProfileService: {
    getTenantInfrastructureProfile: jest.Mock;
  };
  let storageRoutingPolicy: {
    getEffectivePolicy: jest.Mock;
  };

  beforeEach(async () => {
    infrastructureProfileService = {
      getTenantInfrastructureProfile: jest.fn(),
    };

    storageRoutingPolicy = {
      getEffectivePolicy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationSetupService,
        {
          provide: InfrastructureProfileService,
          useValue: infrastructureProfileService,
        },
        {
          provide: StorageRoutingPolicyService,
          useValue: storageRoutingPolicy,
        },
      ],
    }).compile();

    service = module.get<IntegrationSetupService>(IntegrationSetupService);
  });

  it('should infer adapter interface from adapter contract when present', async () => {
    const result = await service.buildSetupSession({
      adapterContractKey: 'n8n-runtime-handoff',
    });

    expect(result.connector.key).toBe('n8n');
    expect(result.adapterContract).toMatchObject({
      key: 'n8n-runtime-handoff',
    });
    expect(result.adapterInterface).toMatchObject({
      key: 'n8n-runtime-artifact-interface',
      requestShape: 'WorkflowRuntimeArtifactRequest',
      runtimeBinding: 'execution-runtime',
    });
    expect(result.wizard[1]).toMatchObject({
      defaults: expect.objectContaining({
        adapterInterfaceKey: 'n8n-runtime-artifact-interface',
      }),
    });
  });

  it('should reject mismatched adapter interface and contract keys', async () => {
    await expect(
      service.buildSetupSession({
        adapterContractKey: 'openclaw-intent-drafting',
        adapterInterfaceKey: 'n8n-runtime-artifact-interface',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject unknown adapter interface keys', async () => {
    await expect(
      service.buildSetupSession({
        adapterInterfaceKey: 'missing-interface',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
