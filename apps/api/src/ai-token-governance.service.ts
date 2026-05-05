import { BadRequestException, Injectable } from '@nestjs/common';

type AiCredentialMode = 'aifut-managed' | 'byo';

type AiModelPolicyInput = {
  providerKey?: string;
  modelKey?: string;
  inputTokenCost?: number;
  outputTokenCost?: number;
  markupPercent?: number;
  currency?: string;
  allowedCredentialModes?: AiCredentialMode[];
};

type AiPackagePolicyInput = {
  packageKey?: string;
  includedMonthlyTokens?: number;
  allowByoKeys?: boolean;
  platformFeePercentForByo?: number;
  hardMonthlyTokenLimit?: number;
  allowedModelKeys?: string[];
};

type AiUsageEstimateInput = {
  tenantSlug: string;
  workspaceSlug?: string | null;
  packagePolicy: AiPackagePolicyInput;
  modelPolicy: AiModelPolicyInput;
  credentialMode?: AiCredentialMode;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  alreadyUsedMonthlyTokens?: number;
};

@Injectable()
export class AiTokenGovernanceService {
  buildModelPolicy(input: AiModelPolicyInput) {
    const providerKey = input.providerKey?.trim();
    const modelKey = input.modelKey?.trim();

    if (!providerKey) {
      throw new BadRequestException('Missing AI provider key.');
    }

    if (!modelKey) {
      throw new BadRequestException('Missing AI model key.');
    }

    const inputTokenCost = this.normalizeNonNegativeNumber(input.inputTokenCost);
    const outputTokenCost = this.normalizeNonNegativeNumber(input.outputTokenCost);
    const markupPercent = this.normalizeNonNegativeNumber(input.markupPercent);
    const allowedCredentialModes = this.normalizeCredentialModes(
      input.allowedCredentialModes,
    );

    return {
      providerKey,
      modelKey,
      currency: input.currency?.trim().toUpperCase() || 'USD',
      inputTokenCost,
      outputTokenCost,
      markupPercent,
      allowedCredentialModes,
      aifutManagedEnabled: allowedCredentialModes.includes('aifut-managed'),
      byoEnabled: allowedCredentialModes.includes('byo'),
    };
  }

  buildPackagePolicy(input: AiPackagePolicyInput) {
    const packageKey = input.packageKey?.trim();

    if (!packageKey) {
      throw new BadRequestException('Missing package key.');
    }

    const includedMonthlyTokens = this.normalizeNonNegativeInteger(
      input.includedMonthlyTokens,
    );
    const hardMonthlyTokenLimit = this.normalizeNonNegativeInteger(
      input.hardMonthlyTokenLimit,
    );

    if (
      hardMonthlyTokenLimit > 0 &&
      hardMonthlyTokenLimit < includedMonthlyTokens
    ) {
      throw new BadRequestException(
        'AI package hard monthly token limit cannot be lower than included monthly tokens.',
      );
    }

    return {
      packageKey,
      includedMonthlyTokens,
      hardMonthlyTokenLimit,
      allowByoKeys: Boolean(input.allowByoKeys),
      platformFeePercentForByo: this.normalizeNonNegativeNumber(
        input.platformFeePercentForByo,
      ),
      allowedModelKeys: this.normalizeStringList(input.allowedModelKeys),
    };
  }

  estimateUsage(input: AiUsageEstimateInput) {
    const packagePolicy = this.buildPackagePolicy(input.packagePolicy);
    const modelPolicy = this.buildModelPolicy(input.modelPolicy);
    const credentialMode = input.credentialMode ?? 'aifut-managed';

    if (!modelPolicy.allowedCredentialModes.includes(credentialMode)) {
      throw new BadRequestException(
        `AI model ${modelPolicy.modelKey} does not allow ${credentialMode} credentials.`,
      );
    }

    if (credentialMode === 'byo' && !packagePolicy.allowByoKeys) {
      throw new BadRequestException(
        `Package ${packagePolicy.packageKey} does not allow BYO AI credentials.`,
      );
    }

    if (
      packagePolicy.allowedModelKeys.length > 0 &&
      !packagePolicy.allowedModelKeys.includes(modelPolicy.modelKey)
    ) {
      throw new BadRequestException(
        `Package ${packagePolicy.packageKey} does not allow AI model ${modelPolicy.modelKey}.`,
      );
    }

    const estimatedInputTokens = this.normalizeNonNegativeInteger(
      input.estimatedInputTokens,
    );
    const estimatedOutputTokens = this.normalizeNonNegativeInteger(
      input.estimatedOutputTokens,
    );
    const totalTokens = estimatedInputTokens + estimatedOutputTokens;
    const alreadyUsedMonthlyTokens = this.normalizeNonNegativeInteger(
      input.alreadyUsedMonthlyTokens,
    );
    const projectedMonthlyTokens = alreadyUsedMonthlyTokens + totalTokens;

    if (
      packagePolicy.hardMonthlyTokenLimit > 0 &&
      projectedMonthlyTokens > packagePolicy.hardMonthlyTokenLimit
    ) {
      throw new BadRequestException(
        `AI usage would exceed package monthly token limit of ${packagePolicy.hardMonthlyTokenLimit}.`,
      );
    }

    const rawProviderCost =
      estimatedInputTokens * modelPolicy.inputTokenCost +
      estimatedOutputTokens * modelPolicy.outputTokenCost;
    const remainingIncludedTokensBeforeUsage = Math.max(
      packagePolicy.includedMonthlyTokens - alreadyUsedMonthlyTokens,
      0,
    );
    const coveredByIncludedTokens =
      credentialMode === 'aifut-managed'
        ? Math.min(totalTokens, remainingIncludedTokensBeforeUsage)
        : 0;
    const overageTokens = Math.max(totalTokens - coveredByIncludedTokens, 0);
    const chargeableRatio = totalTokens > 0 ? overageTokens / totalTokens : 0;
    const aifutProviderCost =
      credentialMode === 'aifut-managed' ? rawProviderCost : 0;
    const chargeableProviderCost = aifutProviderCost * chargeableRatio;
    const aifutMarkupAmount =
      credentialMode === 'aifut-managed'
        ? chargeableProviderCost * (modelPolicy.markupPercent / 100)
        : rawProviderCost * (packagePolicy.platformFeePercentForByo / 100);
    const estimatedCharge = chargeableProviderCost + aifutMarkupAmount;
    const remainingIncludedTokens = Math.max(
      packagePolicy.includedMonthlyTokens - projectedMonthlyTokens,
      0,
    );

    return {
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug ?? null,
      packageKey: packagePolicy.packageKey,
      providerKey: modelPolicy.providerKey,
      modelKey: modelPolicy.modelKey,
      credentialMode,
      estimatedInputTokens,
      estimatedOutputTokens,
      totalTokens,
      alreadyUsedMonthlyTokens,
      projectedMonthlyTokens,
      remainingIncludedTokensBeforeUsage,
      coveredByIncludedTokens,
      overageTokens,
      remainingIncludedTokens,
      rawProviderCost,
      aifutProviderCost,
      chargeableProviderCost,
      aifutMarkupAmount,
      estimatedCharge,
      currency: modelPolicy.currency,
      quotaStatus:
        overageTokens === 0 ? 'within-included-quota' : 'usage-chargeable',
    };
  }

  private normalizeStringList(values?: string[]) {
    if (!values) {
      return [];
    }

    return Array.from(
      new Set(values.map((value) => value.trim()).filter(Boolean)),
    );
  }

  private normalizeCredentialModes(values?: AiCredentialMode[]) {
    const modes = this.normalizeStringList(values) as AiCredentialMode[];

    if (modes.length === 0) {
      return ['aifut-managed'] as AiCredentialMode[];
    }

    return modes.filter((mode) => mode === 'aifut-managed' || mode === 'byo');
  }

  private normalizeNonNegativeNumber(value?: number) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : 0;
  }

  private normalizeNonNegativeInteger(value?: number) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : 0;
  }
}
