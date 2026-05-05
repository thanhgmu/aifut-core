import { BadRequestException } from '@nestjs/common';
import { AiTokenGovernanceService } from './ai-token-governance.service';

describe('AiTokenGovernanceService', () => {
  let service: AiTokenGovernanceService;

  beforeEach(() => {
    service = new AiTokenGovernanceService();
  });

  it('should build AIFUT-managed model policy with normalized commercial fields', () => {
    const result = service.buildModelPolicy({
      providerKey: ' openai ',
      modelKey: ' gpt-lean ',
      inputTokenCost: 0.000001,
      outputTokenCost: 0.000003,
      markupPercent: 35,
      currency: ' usd ',
      allowedCredentialModes: ['aifut-managed', 'byo', 'byo'],
    });

    expect(result).toEqual({
      providerKey: 'openai',
      modelKey: 'gpt-lean',
      currency: 'USD',
      inputTokenCost: 0.000001,
      outputTokenCost: 0.000003,
      markupPercent: 35,
      allowedCredentialModes: ['aifut-managed', 'byo'],
      aifutManagedEnabled: true,
      byoEnabled: true,
    });
  });

  it('should build package policy with BYO controls and model allowlist', () => {
    const result = service.buildPackagePolicy({
      packageKey: ' free-ecosystem ',
      includedMonthlyTokens: 10000.8,
      hardMonthlyTokenLimit: 25000.2,
      allowByoKeys: true,
      platformFeePercentForByo: 5,
      allowedModelKeys: [' gpt-lean ', '', ' local-small ', 'gpt-lean'],
    });

    expect(result).toEqual({
      packageKey: 'free-ecosystem',
      includedMonthlyTokens: 10000,
      hardMonthlyTokenLimit: 25000,
      allowByoKeys: true,
      platformFeePercentForByo: 5,
      allowedModelKeys: ['gpt-lean', 'local-small'],
    });
  });

  it('should estimate AIFUT-managed AI usage without user charge while included quota covers the request', () => {
    const result = service.estimateUsage({
      tenantSlug: 'acme',
      workspaceSlug: 'sales',
      packagePolicy: {
        packageKey: 'starter',
        includedMonthlyTokens: 10000,
        hardMonthlyTokenLimit: 50000,
        allowedModelKeys: ['gpt-lean'],
      },
      modelPolicy: {
        providerKey: 'openai',
        modelKey: 'gpt-lean',
        inputTokenCost: 0.000001,
        outputTokenCost: 0.000003,
        markupPercent: 50,
        allowedCredentialModes: ['aifut-managed'],
      },
      credentialMode: 'aifut-managed',
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 500,
      alreadyUsedMonthlyTokens: 7000,
    });

    expect(result).toEqual({
      tenantSlug: 'acme',
      workspaceSlug: 'sales',
      packageKey: 'starter',
      providerKey: 'openai',
      modelKey: 'gpt-lean',
      credentialMode: 'aifut-managed',
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 500,
      totalTokens: 1500,
      alreadyUsedMonthlyTokens: 7000,
      projectedMonthlyTokens: 8500,
      remainingIncludedTokensBeforeUsage: 3000,
      coveredByIncludedTokens: 1500,
      overageTokens: 0,
      remainingIncludedTokens: 1500,
      rawProviderCost: 0.0025,
      aifutProviderCost: 0.0025,
      chargeableProviderCost: 0,
      aifutMarkupAmount: 0,
      estimatedCharge: 0,
      currency: 'USD',
      quotaStatus: 'within-included-quota',
    });
  });

  it('should estimate BYO AI usage without charging provider token cost to AIFUT quota', () => {
    const result = service.estimateUsage({
      tenantSlug: 'acme',
      packagePolicy: {
        packageKey: 'free-ecosystem',
        includedMonthlyTokens: 0,
        allowByoKeys: true,
        platformFeePercentForByo: 10,
        allowedModelKeys: ['gpt-byo'],
      },
      modelPolicy: {
        providerKey: 'openai',
        modelKey: 'gpt-byo',
        inputTokenCost: 0.000002,
        outputTokenCost: 0.000004,
        allowedCredentialModes: ['byo'],
      },
      credentialMode: 'byo',
      estimatedInputTokens: 2000,
      estimatedOutputTokens: 1000,
    });

    expect(result).toMatchObject({
      credentialMode: 'byo',
      totalTokens: 3000,
      rawProviderCost: 0.008,
      aifutProviderCost: 0,
      chargeableProviderCost: 0,
      coveredByIncludedTokens: 0,
      overageTokens: 3000,
      aifutMarkupAmount: 0.0008,
      estimatedCharge: 0.0008,
      quotaStatus: 'usage-chargeable',
    });
  });

  it('should estimate proportional overage when AIFUT-managed usage exceeds included quota', () => {
    const result = service.estimateUsage({
      tenantSlug: 'acme',
      packagePolicy: {
        packageKey: 'starter',
        includedMonthlyTokens: 1000,
        hardMonthlyTokenLimit: 5000,
      },
      modelPolicy: {
        providerKey: 'openai',
        modelKey: 'gpt-lean',
        inputTokenCost: 0.000001,
        outputTokenCost: 0.000003,
        markupPercent: 20,
      },
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 1000,
      alreadyUsedMonthlyTokens: 500,
    });

    expect(result).toMatchObject({
      totalTokens: 2000,
      remainingIncludedTokensBeforeUsage: 500,
      coveredByIncludedTokens: 500,
      overageTokens: 1500,
      rawProviderCost: 0.004,
      aifutProviderCost: 0.004,
      chargeableProviderCost: 0.003,
      quotaStatus: 'usage-chargeable',
    });
    expect(result.aifutMarkupAmount).toBeCloseTo(0.0006);
    expect(result.estimatedCharge).toBeCloseTo(0.0036);
  });

  it('should reject BYO usage when the package does not allow user-managed AI keys', () => {
    expect(() =>
      service.estimateUsage({
        tenantSlug: 'acme',
        packagePolicy: {
          packageKey: 'locked-plan',
          allowByoKeys: false,
        },
        modelPolicy: {
          providerKey: 'openai',
          modelKey: 'gpt-byo',
          allowedCredentialModes: ['byo'],
        },
        credentialMode: 'byo',
      }),
    ).toThrow('Package locked-plan does not allow BYO AI credentials.');
  });

  it('should reject usage that exceeds hard monthly token limit', () => {
    expect(() =>
      service.estimateUsage({
        tenantSlug: 'acme',
        packagePolicy: {
          packageKey: 'starter',
          hardMonthlyTokenLimit: 5000,
        },
        modelPolicy: {
          providerKey: 'openai',
          modelKey: 'gpt-lean',
        },
        estimatedInputTokens: 2000,
        estimatedOutputTokens: 1000,
        alreadyUsedMonthlyTokens: 3000,
      }),
    ).toThrow('AI usage would exceed package monthly token limit of 5000.');
  });

  it('should reject package limits lower than included monthly tokens', () => {
    expect(() =>
      service.buildPackagePolicy({
        packageKey: 'bad-plan',
        includedMonthlyTokens: 10000,
        hardMonthlyTokenLimit: 5000,
      }),
    ).toThrow(BadRequestException);
  });
});
