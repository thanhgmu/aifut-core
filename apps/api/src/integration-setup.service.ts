import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ADAPTER_CONTRACT_FOUNDATION } from './adapter-contracts.constants';
import { APP_DEFINITION_FOUNDATION } from './app-definitions.constants';
import { CONNECTOR_REGISTRY_FOUNDATION } from './connectors.constants';
import { InfrastructureProfileService } from './infrastructure-profile.service';
import { StorageRoutingPolicyService } from './storage-routing-policy.service';

@Injectable()
export class IntegrationSetupService {
  constructor(
    private readonly infrastructureProfileService: InfrastructureProfileService,
    private readonly storageRoutingPolicy: StorageRoutingPolicyService,
  ) {}

  async buildSetupSession(input: {
    connectorKey?: string;
    appDefinitionKey?: string;
    adapterContractKey?: string;
    tenantSlug?: string;
    workspaceSlug?: string;
    userEmail?: string;
    hostname?: string;
    storagePolicyKey?: string;
  }) {
    const connectorKey = input.connectorKey?.trim().toLowerCase();
    const appDefinitionKey = input.appDefinitionKey?.trim().toLowerCase();
    const adapterContractKey = input.adapterContractKey?.trim().toLowerCase();

    const adapterContract = adapterContractKey
      ? ADAPTER_CONTRACT_FOUNDATION.find(
          (candidate) => candidate.key === adapterContractKey,
        ) ?? null
      : null;

    if (adapterContractKey && !adapterContract) {
      throw new NotFoundException(
        `Adapter contract not found for key: ${adapterContractKey}`,
      );
    }

    const appDefinition = appDefinitionKey
      ? APP_DEFINITION_FOUNDATION.find(
          (candidate) => candidate.key === appDefinitionKey,
        ) ?? null
      : adapterContract
        ? APP_DEFINITION_FOUNDATION.find(
            (candidate) => candidate.key === adapterContract.appDefinitionKey,
          ) ?? null
        : null;

    if (appDefinitionKey && !appDefinition) {
      throw new NotFoundException(
        `App definition not found for key: ${appDefinitionKey}`,
      );
    }

    const resolvedConnectorKey =
      connectorKey ?? adapterContract?.connectorKey ?? appDefinition?.connectorKey ?? null;

    if (!resolvedConnectorKey) {
      throw new BadRequestException(
        'Missing connectorKey, appDefinitionKey, or adapterContractKey.',
      );
    }

    const connector = CONNECTOR_REGISTRY_FOUNDATION.find(
      (candidate) => candidate.key === resolvedConnectorKey,
    );

    if (!connector) {
      throw new NotFoundException(
        `Connector not found for key: ${resolvedConnectorKey}`,
      );
    }

    const infrastructureProfile = input.tenantSlug
      ? await this.infrastructureProfileService.getTenantInfrastructureProfile(
          input.tenantSlug,
        )
      : null;

    const storageRouting =
      input.tenantSlug && input.storagePolicyKey
        ? await this.storageRoutingPolicy.getEffectivePolicy({
            tenantSlug: input.tenantSlug,
            workspaceSlug: input.workspaceSlug,
            userEmail: input.userEmail,
            hostname: input.hostname,
            policyKey: input.storagePolicyKey,
          })
        : null;

    const authStep = this.buildAuthStep(connector.authModes);
    const mappingStep = this.buildMappingStep(connector.category);

    return {
      capability: 'integrations',
      surface: 'setup-session',
      status: 'drafted',
      connector: {
        key: connector.key,
        name: connector.name,
        category: connector.category,
        authModes: connector.authModes,
        syncDirections: connector.syncDirections,
        capabilities: connector.capabilities,
        audience: connector.audience,
      },
      appDefinition: appDefinition
        ? {
            key: appDefinition.key,
            name: appDefinition.name,
            role: appDefinition.role,
            status: appDefinition.status,
            capabilityContractKeys: appDefinition.capabilityContractKeys,
          }
        : null,
      adapterContract: adapterContract
        ? {
            key: adapterContract.key,
            status: adapterContract.status,
            operationMode: adapterContract.operationMode,
            capabilities: adapterContract.capabilities,
            requiredInputs: adapterContract.requiredInputs,
            outputArtifacts: adapterContract.outputArtifacts,
            safetyBoundaries: adapterContract.safetyBoundaries,
          }
        : null,
      context: {
        tenantSlug: input.tenantSlug?.trim().toLowerCase() ?? null,
        workspaceSlug: input.workspaceSlug?.trim().toLowerCase() ?? null,
        storagePolicyKey: input.storagePolicyKey?.trim().toLowerCase() ?? null,
        infrastructureProfile,
        storageRouting,
      },
      setupModes: [
        {
          key: 'template-first',
          label: 'Use a prebuilt connector template',
          audience: 'non-technical',
        },
        {
          key: 'ai-assisted',
          label: 'Describe the connection in natural language',
          audience: 'mixed',
        },
        {
          key: 'advanced',
          label: 'Configure endpoints, mappings, and policies manually',
          audience: 'technical',
        },
      ],
      wizard: [
        {
          key: 'choose-connection-scope',
          title: 'Choose tenant and workspace scope',
          goal: 'Bind the integration to the correct operator, tenant, and workspace context.',
          inputs: ['tenantSlug', 'workspaceSlug'],
          validations: ['tenant-exists', 'workspace-belongs-to-tenant'],
        },
        {
          key: 'choose-connection-template',
          title: 'Choose provider template',
          goal: 'Start from a known connector contract instead of building from scratch.',
          inputs: ['connectorKey', 'appDefinitionKey', 'adapterContractKey'],
          defaults: {
            connectorKey: connector.key,
            appDefinitionKey: appDefinition?.key ?? null,
            adapterContractKey: adapterContract?.key ?? null,
          },
          validations: ['connector-supported'],
        },
        authStep,
        {
          key: 'test-connectivity',
          title: 'Test endpoint and authentication',
          goal: 'Detect wrong domain, expired auth, rate limits, or missing permissions early.',
          outputs: ['connectivity-status', 'detected-issues', 'health-hints'],
        },
        mappingStep,
        {
          key: 'confirm-storage-and-sync-policy',
          title: 'Confirm storage, routing, and sync policy',
          goal: 'Make data sovereignty and billing boundaries explicit before activation.',
          inputs: ['storagePolicyKey', 'syncPolicy', 'eventMappings'],
          outputs: ['effective-storage-topology', 'metering-boundary'],
        },
        {
          key: 'activate-connection',
          title: 'Activate after review',
          goal: 'Persist the connection only after operator and policy checks are satisfied.',
          outputs: ['connection-record', 'recommended-next-actions'],
        },
      ],
      generatedQuestions: this.buildGeneratedQuestions(
        connector.category,
        appDefinition?.role ?? null,
      ),
      recommendedDiagnostics: [
        'auth-check',
        'endpoint-reachability',
        'mapping-readiness',
        'storage-policy-readiness',
        'webhook-or-sync-direction-check',
      ],
      next: ['save-draft-session', 'run-diagnostics', 'persist-connection-instance'],
    };
  }

  private buildAuthStep(authModes: readonly string[]) {
    return {
      key: 'provide-authentication',
      title: 'Provide authentication and remote endpoint',
      goal: 'Collect the minimum credentials and endpoint data needed to test the connector safely.',
      authModes,
      fields: authModes.map((mode) => ({
        mode,
        requiredFields: this.getRequiredFieldsForAuthMode(mode),
      })),
    };
  }

  private buildMappingStep(category: string) {
    const defaults = {
      crm: ['contacts', 'leads', 'tasks', 'invoices'],
      commerce: ['customers', 'orders', 'products'],
      lms: ['members', 'courses', 'enrollments', 'progress-events'],
      workflow: ['triggers', 'actions', 'execution-events'],
      analytics: ['events', 'segments', 'dashboards'],
      messaging: ['contacts', 'conversations', 'delivery-events'],
      ai: ['prompts', 'tokens', 'usage-events'],
      storage: ['files', 'backups', 'metadata'],
      payments: ['customers', 'subscriptions', 'transactions'],
      custom: ['objects', 'events', 'actions'],
    } as const;

    return {
      key: 'map-business-objects',
      title: 'Map business objects and events',
      goal: 'Normalize external records into Aifut control-plane language.',
      defaults: defaults[category as keyof typeof defaults] ?? defaults.custom,
      assistance: [
        'template-defaults',
        'ai-suggested-field-mapping',
        'event-policy-hints',
      ],
    };
  }

  private buildGeneratedQuestions(category: string, appRole?: string | null) {
    const shared = [
      'What domain or base URL should the core connect to?',
      'Which authentication method do you want to use?',
      'Which tenant/workspace should own this connection?',
      'Should data stay on your infrastructure, on platform-managed storage, or hybrid?',
    ];

    const categorySpecific: Record<string, string[]> = {
      crm: [
        'Which customer, lead, or task records should sync first?',
        'Should updates flow one-way or both ways?',
      ],
      commerce: [
        'Do you want to sync customers, orders, products, or all three?',
        'Should new orders trigger workflows automatically?',
      ],
      lms: [
        'Should course progress sync into analytics and entitlement logic?',
        'Do you need enrollment events pushed back to the LMS?',
      ],
      workflow: [
        'Which events should trigger workflow execution?',
        'Should users edit the flow visually or only through natural language?',
      ],
      custom: [
        'Which endpoints matter most for the first sync?',
        'Which business objects should the core treat as canonical?',
      ],
    };

    const roleSpecific: Record<string, string[]> = {
      'agent-runtime': [
        'What should users be able to create or ask in natural language first?',
        'Which actions must stay approval-gated before autonomous execution?',
      ],
      'workflow-runtime': [
        'Which child workflows should be generated from natural language first?',
        'Which runtime events must come back into AIFUT as canonical summaries?',
      ],
      'generation-engine': [
        'Which content or asset types should users be able to generate first?',
      ],
      'affiliate-engine': [
        'Which campaign or referral summaries should be surfaced first?',
      ],
      'crm-domain': [
        'Which CRM summaries and safe actions should natural-language users get first?',
      ],
    };

    return [
      ...shared,
      ...(categorySpecific[category] ?? categorySpecific.custom),
      ...((appRole && roleSpecific[appRole]) ?? []),
    ];
  }

  private getRequiredFieldsForAuthMode(mode: string) {
    switch (mode) {
      case 'api-key':
        return ['baseUrl', 'apiKey'];
      case 'oauth2':
        return ['baseUrl', 'clientId', 'clientSecret', 'authorizeUrl', 'tokenUrl'];
      case 'basic':
        return ['baseUrl', 'username', 'password'];
      case 'webhook-shared-secret':
        return ['baseUrl', 'sharedSecret'];
      case 'custom':
      default:
        return ['baseUrl', 'customAuthReference'];
    }
  }
}
