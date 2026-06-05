import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CONNECTOR_REGISTRY_FOUNDATION } from './connectors.constants';

@Injectable()
export class IntegrationAiDraftingService {
  draftFromNaturalLanguage(input: {
    connectorKey?: string;
    prompt?: string;
    tenantSlug?: string;
    workspaceSlug?: string;
    storagePolicyKey?: string;
  }) {
    const connectorKey = input.connectorKey?.trim().toLowerCase();
    const prompt = input.prompt?.trim();

    if (!connectorKey) {
      throw new BadRequestException('Missing connectorKey.');
    }

    if (!prompt) {
      throw new BadRequestException('Missing prompt.');
    }

    const connector = CONNECTOR_REGISTRY_FOUNDATION.find(
      (candidate) => candidate.key === connectorKey,
    );

    if (!connector) {
      throw new NotFoundException(
        `Connector not found for key: ${connectorKey}`,
      );
    }

    const normalizedPrompt = prompt.toLowerCase();
    const suggestedObjects = this.suggestObjects(
      connector.category,
      normalizedPrompt,
    );
    const suggestedSyncMode = this.suggestSyncMode(
      normalizedPrompt,
      connector.syncDirections,
    );
    const suggestedSetupMode = this.suggestSetupMode(normalizedPrompt);
    const draftName = this.buildDraftName(
      connector.name,
      input.workspaceSlug,
      input.tenantSlug,
    );
    const draftSlug = this.slugify(draftName);
    const inputContext = {
      tenantSlug: input.tenantSlug?.trim().toLowerCase() ?? null,
      workspaceSlug: input.workspaceSlug?.trim().toLowerCase() ?? null,
      storagePolicyKey: input.storagePolicyKey?.trim().toLowerCase() ?? null,
      prompt,
    };
    const draft = {
      setupMode: suggestedSetupMode,
      name: draftName,
      slug: draftSlug,
      mappingProfile: {
        mode: 'ai-assisted',
        objects: suggestedObjects,
        fieldMappings: this.buildFieldMappingHints(
          connector.key,
          suggestedObjects,
        ),
        eventMappings: this.buildEventMappingHints(
          connector.key,
          suggestedObjects,
        ),
        syncPolicy: {
          mode: suggestedSyncMode,
          verification: 'manual-before-enable',
          conflictResolution: normalizedPrompt.includes('override')
            ? 'source-priority'
            : 'review-before-write',
        },
      },
      workflowHints: this.buildWorkflowHints(connector.key, normalizedPrompt),
    };

    return {
      capability: 'integrations',
      surface: 'ai-drafting',
      status: 'drafted',
      connector: {
        key: connector.key,
        name: connector.name,
        category: connector.category,
      },
      inputContext,
      draft,
      setupExecutionArtifact: this.buildSetupExecutionArtifact({
        connectorKey: connector.key,
        connectorName: connector.name,
        connectorCategory: connector.category,
        connectorAudience: connector.audience,
        inputContext,
        draft,
      }),
      missingInformation: this.buildMissingInformation(
        connector.key,
        normalizedPrompt,
      ),
      operatorQuestions: this.buildOperatorQuestions(
        connector.key,
        normalizedPrompt,
      ),
      readiness: {
        canCreateDraftConnection: true,
        requiresHumanReview: true,
        requiresCredentialInput: true,
      },
      next: [
        'review-draft-mapping',
        'collect-credentials',
        'run-setup-session',
        'run-diagnostics-before-activation',
      ],
    };
  }

  private buildSetupExecutionArtifact(input: {
    connectorKey: string;
    connectorName: string;
    connectorCategory: string;
    connectorAudience: string;
    inputContext: {
      tenantSlug: string | null;
      workspaceSlug: string | null;
      storagePolicyKey: string | null;
      prompt: string;
    };
    draft: {
      setupMode: string;
      name: string;
      slug: string;
      mappingProfile: {
        objects: string[];
        syncPolicy: {
          mode: string;
          verification: string;
          conflictResolution: string;
        };
      };
      workflowHints: string[];
    };
  }) {
    const scopeSlug =
      input.inputContext.workspaceSlug ??
      input.inputContext.tenantSlug ??
      'tenant';

    return {
      artifactKey: `integration-setup:${scopeSlug}:${input.connectorKey}:${input.draft.slug}`,
      artifactType: 'natural-language-integration-setup',
      artifactStatus: 'review-ready',
      audience: input.connectorAudience,
      nonTechnicalMode: true,
      naturalLanguageGoal: input.inputContext.prompt,
      customerExperienceGoal:
        'Keep downstream customer interactions accurate, timely, and reviewable before automation is enabled.',
      setupTrack: input.draft.setupMode,
      reviewBoundaries: {
        previewOnly: true,
        activationAllowed: false,
        externalActionsAllowed: false,
        requiresHumanReview: true,
      },
      dataContract: {
        connectorKey: input.connectorKey,
        connectorName: input.connectorName,
        connectorCategory: input.connectorCategory,
        objects: input.draft.mappingProfile.objects,
        syncMode: input.draft.mappingProfile.syncPolicy.mode,
        storagePolicyKey: input.inputContext.storagePolicyKey,
      },
      executionSteps: [
        {
          actionKey: 'confirm-connection-scope',
          actionOrder: 1,
          actionStatus: 'required',
          owner: 'operator',
          outputArtifactKeys: ['tenant-workspace-scope'],
        },
        {
          actionKey: 'collect-credential-reference',
          actionOrder: 2,
          actionStatus: 'required',
          owner: 'operator',
          outputArtifactKeys: ['credential-reference'],
        },
        {
          actionKey: 'review-mapping-profile',
          actionOrder: 3,
          actionStatus: 'required',
          owner: 'operator',
          outputArtifactKeys: ['mapping-profile-review'],
        },
        {
          actionKey: 'run-diagnostics-before-activation',
          actionOrder: 4,
          actionStatus: 'required',
          owner: 'system',
          outputArtifactKeys: ['diagnostic-run'],
        },
        {
          actionKey: 'submit-activation-review',
          actionOrder: 5,
          actionStatus: 'blocked-until-diagnostics-pass',
          owner: 'operator',
          outputArtifactKeys: ['activation-review'],
        },
      ],
      handoff: {
        setupSessionEndpoint: 'GET /integrations/setup-session',
        diagnosticsEndpoint: 'GET /integrations/diagnostics',
        activationReviewEndpoint:
          'POST /integrations/workflow/review-activation',
      },
    };
  }

  private suggestObjects(category: string, prompt: string) {
    const defaults = {
      crm: ['contacts', 'leads', 'tasks', 'invoices'],
      commerce: ['customers', 'orders', 'products'],
      lms: ['members', 'courses', 'enrollments'],
      workflow: ['triggers', 'actions', 'execution-events'],
      analytics: ['events', 'segments', 'dashboards'],
      messaging: ['contacts', 'conversations', 'delivery-events'],
      ai: ['prompts', 'tokens', 'usage-events'],
      storage: ['files', 'backups', 'metadata'],
      payments: ['customers', 'subscriptions', 'transactions'],
      custom: ['objects', 'events', 'actions'],
    } as const;

    const seeded = [
      ...(defaults[category as keyof typeof defaults] ?? defaults.custom),
    ];

    if (prompt.includes('lead') && !seeded.includes('leads')) {
      seeded.push('leads');
    }

    if (prompt.includes('task') && !seeded.includes('tasks')) {
      seeded.push('tasks');
    }

    if (prompt.includes('workflow') && !seeded.includes('execution-events')) {
      seeded.push('execution-events');
    }

    if (prompt.includes('invoice') && !seeded.includes('invoices')) {
      seeded.push('invoices');
    }

    return seeded;
  }

  private suggestSyncMode(
    prompt: string,
    supportedDirections: readonly string[],
  ) {
    if (
      prompt.includes('both') ||
      prompt.includes('hai chiều') ||
      prompt.includes('bidirectional')
    ) {
      return supportedDirections.includes('bidirectional')
        ? 'bidirectional'
        : supportedDirections[0];
    }

    if (prompt.includes('webhook') || prompt.includes('event')) {
      return supportedDirections.includes('event-driven')
        ? 'event-driven'
        : supportedDirections[0];
    }

    if (prompt.includes('push')) {
      return supportedDirections.includes('push')
        ? 'push'
        : supportedDirections[0];
    }

    return supportedDirections[0];
  }

  private suggestSetupMode(prompt: string) {
    if (
      prompt.includes('json') ||
      prompt.includes('schema') ||
      prompt.includes('endpoint') ||
      prompt.includes('advanced')
    ) {
      return 'advanced';
    }

    return 'ai-assisted';
  }

  private buildDraftName(
    connectorName: string,
    workspaceSlug?: string,
    tenantSlug?: string,
  ) {
    const scope = workspaceSlug?.trim() || tenantSlug?.trim() || 'tenant';
    return `${connectorName} ${scope} draft`;
  }

  private slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private buildFieldMappingHints(connectorKey: string, objects: string[]) {
    if (connectorKey === 'nexovaflow') {
      return {
        leads: {
          externalId: 'lead.id',
          title: 'lead.name',
          owner: 'lead.assigned',
          status: 'lead.status',
        },
        tasks: {
          externalId: 'task.id',
          title: 'task.name',
          dueAt: 'task.duedate',
          owner: 'task.assigned',
        },
      };
    }

    return Object.fromEntries(
      objects.map((object) => [
        object,
        { externalId: `${object}.id`, title: `${object}.name` },
      ]),
    );
  }

  private buildEventMappingHints(connectorKey: string, objects: string[]) {
    if (connectorKey === 'nexovaflow') {
      return {
        lead_created: 'crm.lead.created',
        lead_updated: 'crm.lead.updated',
        task_created: 'ops.task.created',
        workflow_requested: 'automation.workflow.requested',
      };
    }

    return Object.fromEntries(
      objects.map((object) => [`${object}_updated`, `${object}.updated`]),
    );
  }

  private buildWorkflowHints(connectorKey: string, prompt: string) {
    if (connectorKey === 'nexovaflow') {
      return [
        'Map natural-language requests into stable action contracts before calling NexovaFlow runtime actions.',
        'Prefer lead/task/dashboard summary actions first, then expand to billing and automation.',
        'Keep NexovaFlow as downstream execution surface, not source of platform truth.',
      ];
    }

    if (prompt.includes('workflow') || prompt.includes('tự động')) {
      return [
        'Consider adding workflow bridge handoff after initial sync succeeds.',
        'Expose operator-visible event mapping before enabling automatic writes.',
      ];
    }

    return ['Review workflow automation after basic connection health passes.'];
  }

  private buildMissingInformation(connectorKey: string, prompt: string) {
    const missing = ['baseUrl', 'credentialReference'];

    if (!prompt.includes('workspace')) {
      missing.push('workspace-scope-confirmation');
    }

    if (connectorKey === 'nexovaflow') {
      missing.push('bridge-token-or-auth-contract');
      missing.push('initial-action-set-confirmation');
    }

    return missing;
  }

  private buildOperatorQuestions(connectorKey: string, prompt: string) {
    const questions = [
      'Which workspace should own this integration?',
      'Should writes stay platform-managed, tenant-managed, or hybrid?',
      'Which authentication method is acceptable for the first rollout?',
    ];

    if (!prompt.includes('lead')) {
      questions.push('Do you want leads included in the first sync scope?');
    }

    if (connectorKey === 'nexovaflow') {
      questions.push(
        'Should NexovaFlow start with read-heavy operator actions before write actions?',
      );
      questions.push(
        'Do you want the bridge to expose natural-language action presets for leads, tasks, and dashboard summary first?',
      );
    }

    return questions;
  }
}
