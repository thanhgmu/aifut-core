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

type AiRoutingPreviewInput = {
  tenantSlug: string;
  workspaceSlug?: string | null;
  packagePolicy: AiPackagePolicyInput;
  modelPolicies: AiModelPolicyInput[];
  taskType?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  qualityRequirement?: 'economy' | 'balanced' | 'premium';
  latencyBudget?: 'interactive' | 'background';
  costBudgetClass?: 'strict-economy' | 'balanced' | 'premium-controlled';
  preferCredentialMode?: AiCredentialMode;
  deterministicEligible?: boolean;
  cacheHitAvailable?: boolean;
  quotaPressure?: 'normal' | 'near-limit' | 'hard-limit';
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
    if (!input.packagePolicy) {
      throw new BadRequestException('AI package policy is required.');
    }

    if (!input.modelPolicy) {
      throw new BadRequestException('AI model policy is required.');
    }

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

  previewRouting(input: AiRoutingPreviewInput) {
    if (!input.packagePolicy) {
      throw new BadRequestException('AI package policy is required.');
    }

    if (!Array.isArray(input.modelPolicies) || input.modelPolicies.length === 0) {
      throw new BadRequestException('At least one AI model policy is required.');
    }

    const packagePolicy = this.buildPackagePolicy(input.packagePolicy);
    const normalizedModels = input.modelPolicies.map((modelPolicy) =>
      this.buildModelPolicy(modelPolicy),
    );


    if (normalizedModels.length === 0) {
      throw new BadRequestException('At least one AI model policy is required.');
    }

    const riskLevel = input.riskLevel ?? 'medium';
    const qualityRequirement = input.qualityRequirement ?? 'balanced';
    const latencyBudget = input.latencyBudget ?? 'interactive';
    const costBudgetClass = input.costBudgetClass ?? 'balanced';
    const quotaPressure = input.quotaPressure ?? 'normal';

    if (input.deterministicEligible) {
      return {
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
        packageKey: packagePolicy.packageKey,
        routingDecision: 'deterministic-lane',
        recommendedTier: 'tier-0',
        executionMode: 'no-model',
        selectedModel: null,
        fallbackModel: null,
        recommendedCredentialMode: null,
        reasoning: [
          'Task is eligible for deterministic execution.',
          'Avoid model usage to minimize cost and latency.',
        ],
        policySignals: {
          taskType: input.taskType?.trim() || 'unspecified',
          riskLevel,
          qualityRequirement,
          latencyBudget,
          costBudgetClass,
          quotaPressure,
          cacheHitAvailable: Boolean(input.cacheHitAvailable),
        },
      };
    }

    if (input.cacheHitAvailable) {
      return {
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
        packageKey: packagePolicy.packageKey,
        routingDecision: 'artifact-cache-lane',
        recommendedTier: 'tier-0',
        executionMode: 'cache-reuse',
        selectedModel: null,
        fallbackModel: null,
        recommendedCredentialMode: null,
        reasoning: [
          'A reusable cached artifact is available.',
          'Reuse is preferred before fresh inference.',
        ],
        policySignals: {
          taskType: input.taskType?.trim() || 'unspecified',
          riskLevel,
          qualityRequirement,
          latencyBudget,
          costBudgetClass,
          quotaPressure,
          cacheHitAvailable: true,
        },
      };
    }

    const preferredCredentialMode = this.resolvePreferredCredentialMode(
      input.preferCredentialMode,
      packagePolicy,
      normalizedModels,
    );
    const baseTier = this.resolveBaseTier({
      riskLevel,
      qualityRequirement,
      latencyBudget,
      costBudgetClass,
      quotaPressure,
    });
    const tierBudget = this.resolveTierBudget(baseTier, quotaPressure);
    const candidates = normalizedModels
      .filter((model) =>
        packagePolicy.allowedModelKeys.length === 0
          ? true
          : packagePolicy.allowedModelKeys.includes(model.modelKey),
      )
      .filter((model) => model.allowedCredentialModes.includes(preferredCredentialMode))
      .map((model) => ({
        ...model,
        heuristicTier: this.classifyModelTier(model),
      }));

    const tierConstrained = candidates.filter(
      (model) => model.heuristicTier <= tierBudget,
    );
    const selectionPool = tierConstrained.length > 0 ? tierConstrained : candidates;

    if (selectionPool.length === 0) {
      throw new BadRequestException(
        `Package ${packagePolicy.packageKey} does not allow any AI models for ${preferredCredentialMode} routing.`,
      );
    }

    const sortedPool = [...selectionPool].sort((left, right) => {
      if (left.heuristicTier !== right.heuristicTier) {
        return left.heuristicTier - right.heuristicTier;
      }

      const leftCost = left.inputTokenCost + left.outputTokenCost;
      const rightCost = right.inputTokenCost + right.outputTokenCost;

      if (leftCost !== rightCost) {
        return leftCost - rightCost;
      }

      return left.modelKey.localeCompare(right.modelKey);
    });

    const selectedModel = sortedPool[0];
    const fallbackModel = sortedPool.find(
      (candidate) => candidate.modelKey !== selectedModel.modelKey,
    );

    return {
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug ?? null,
      packageKey: packagePolicy.packageKey,
      routingDecision:
        latencyBudget === 'background' && selectedModel.heuristicTier <= 2
          ? 'background-batch-lane'
          : 'model-inference-lane',
      recommendedTier: `tier-${selectedModel.heuristicTier}`,
      executionMode:
        latencyBudget === 'background' && selectedModel.heuristicTier <= 2
          ? 'async-batch'
          : 'direct-inference',
      selectedModel: {
        providerKey: selectedModel.providerKey,
        modelKey: selectedModel.modelKey,
        heuristicTier: selectedModel.heuristicTier,
        currency: selectedModel.currency,
        inputTokenCost: selectedModel.inputTokenCost,
        outputTokenCost: selectedModel.outputTokenCost,
      },
      fallbackModel: fallbackModel
        ? {
            providerKey: fallbackModel.providerKey,
            modelKey: fallbackModel.modelKey,
            heuristicTier: fallbackModel.heuristicTier,
          }
        : null,
      recommendedCredentialMode: preferredCredentialMode,
      reasoning: this.buildRoutingReasoning({
        taskType: input.taskType,
        riskLevel,
        qualityRequirement,
        costBudgetClass,
        latencyBudget,
        quotaPressure,
        selectedModelKey: selectedModel.modelKey,
        selectedTier: selectedModel.heuristicTier,
      }),
      policySignals: {
        taskType: input.taskType?.trim() || 'unspecified',
        riskLevel,
        qualityRequirement,
        latencyBudget,
        costBudgetClass,
        quotaPressure,
        cacheHitAvailable: Boolean(input.cacheHitAvailable),
      },
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

  private resolvePreferredCredentialMode(
    preferred: AiCredentialMode | undefined,
    packagePolicy: ReturnType<AiTokenGovernanceService['buildPackagePolicy']>,
    models: Array<ReturnType<AiTokenGovernanceService['buildModelPolicy']>>,
  ): AiCredentialMode {
    if (
      preferred === 'byo' &&
      packagePolicy.allowByoKeys &&
      models.some((model) => model.allowedCredentialModes.includes('byo'))
    ) {
      return 'byo';
    }

    if (models.some((model) => model.allowedCredentialModes.includes('aifut-managed'))) {
      return 'aifut-managed';
    }

    if (
      packagePolicy.allowByoKeys &&
      models.some((model) => model.allowedCredentialModes.includes('byo'))
    ) {
      return 'byo';
    }

    return 'aifut-managed';
  }

  private resolveBaseTier(input: {
    riskLevel: 'low' | 'medium' | 'high';
    qualityRequirement: 'economy' | 'balanced' | 'premium';
    latencyBudget: 'interactive' | 'background';
    costBudgetClass: 'strict-economy' | 'balanced' | 'premium-controlled';
    quotaPressure: 'normal' | 'near-limit' | 'hard-limit';
  }) {
    if (input.riskLevel === 'high' || input.qualityRequirement === 'premium') {
      return 3;
    }

    if (input.latencyBudget === 'background') {
      return 1;
    }

    if (
      input.riskLevel === 'medium' ||
      input.qualityRequirement === 'balanced' ||
      input.costBudgetClass === 'balanced'
    ) {
      return 2;
    }

    return 1;
  }

  private resolveTierBudget(
    baseTier: number,
    quotaPressure: 'normal' | 'near-limit' | 'hard-limit',
  ) {
    if (quotaPressure === 'hard-limit') {
      return 1;
    }

    if (quotaPressure === 'near-limit') {
      return Math.max(baseTier - 1, 1);
    }

    return baseTier;
  }

  private classifyModelTier(
    model: ReturnType<AiTokenGovernanceService['buildModelPolicy']>,
  ) {
    const combinedCost = model.inputTokenCost + model.outputTokenCost;
    const modelKey = model.modelKey.toLowerCase();

    if (
      modelKey.includes('reason') ||
      modelKey.includes('sonnet') ||
      modelKey.includes('opus') ||
      modelKey.includes('gpt-5') ||
      combinedCost >= 0.00002
    ) {
      return 3;
    }

    if (
      modelKey.includes('mini') ||
      modelKey.includes('lean') ||
      modelKey.includes('flash') ||
      modelKey.includes('small') ||
      combinedCost <= 0.000004
    ) {
      return 1;
    }

    return 2;
  }

  private buildRoutingReasoning(input: {
    taskType?: string;
    riskLevel: 'low' | 'medium' | 'high';
    qualityRequirement: 'economy' | 'balanced' | 'premium';
    latencyBudget: 'interactive' | 'background';
    costBudgetClass: 'strict-economy' | 'balanced' | 'premium-controlled';
    quotaPressure: 'normal' | 'near-limit' | 'hard-limit';
    selectedModelKey: string;
    selectedTier: number;
  }) {
    const reasons = [
      `Task routing started from ${input.riskLevel} risk and ${input.qualityRequirement} quality requirements.`,
      `Cost posture is ${input.costBudgetClass} with ${input.quotaPressure} quota pressure.`,
      `Selected ${input.selectedModelKey} at tier-${input.selectedTier} as the cheapest sufficient candidate.`,
    ];

    if (input.latencyBudget === 'background') {
      reasons.push('Background latency budget allows cheaper async/batch handling.');
    }

    if (input.taskType?.trim()) {
      reasons.push(`Task type ${input.taskType.trim()} stays policy-visible for later audit and tuning.`);
    }

    return reasons;
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
