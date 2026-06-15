import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { RequireAccessPolicy } from './access-policy.decorator';
import { AccessPolicyGuard } from './access-policy.guard';
import { ConnectionInstancesService } from './connection-instances.service';
import { CredentialReferencesService } from './credential-references.service';
import { InfrastructureProfileService } from './infrastructure-profile.service';
import { IntegrationAiDraftingService } from './integration-ai-drafting.service';
import { IntegrationControlPlaneService } from './integration-control-plane.service';
import { IntegrationDiagnosticsService } from './integration-diagnostics.service';
import { INTEGRATIONS_FOUNDATION_ROADMAP } from './integrations.constants';
import { IntegrationSetupService } from './integration-setup.service';
import { IntegrationWorkflowService } from './integration-workflow.service';
import { IntegrationAwlGeneratorService } from './integration-awl-generator.service';
import { PrismaService } from './prisma.service';
import { StorageRoutingPolicyService } from './storage-routing-policy.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly infrastructureProfileService: InfrastructureProfileService,
    private readonly connectionInstances: ConnectionInstancesService,
    private readonly credentialReferences: CredentialReferencesService,
    private readonly storageRoutingPolicy: StorageRoutingPolicyService,
    private readonly integrationControlPlane: IntegrationControlPlaneService,
    private readonly integrationSetup: IntegrationSetupService,
    private readonly integrationDiagnostics: IntegrationDiagnosticsService,
    private readonly integrationAiDrafting: IntegrationAiDraftingService,
    private readonly integrationWorkflow: IntegrationWorkflowService,
    private readonly integrationAwlGenerator: IntegrationAwlGeneratorService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'integrations',
      status: 'foundation',
      supports: {
        connectorRegistry: true,
        tenantOwnedInfrastructure: true,
        workflowHandoffs: true,
        persistedConnectionSetup: true,
        mappingProfiles: true,
      },
      next: INTEGRATIONS_FOUNDATION_ROADMAP,
    };
  }

  @Get('infrastructure-profile')
  async infrastructureProfile(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
  ) {
    return {
      capability: 'integrations',
      status: 'resolved',
      profile:
        await this.infrastructureProfileService.getTenantInfrastructureProfile(
          tenantSlugHeader ?? tenantSlugQuery,
        ),
    };
  }

  @Get('domain-routing')
  async domainRouting(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
  ) {
    return this.infrastructureProfileService.getDomainRoutingPolicy(
      tenantSlugHeader ?? tenantSlugQuery,
    );
  }

  @Get('storage-routing')
  async storageRouting(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Query('policyKey') policyKey?: string,
    @Query('writePath') writePath?: string,
  ) {
    return {
      capability: 'integrations',
      status: 'resolved',
      storage: await this.storageRoutingPolicy.getEffectivePolicy({
        tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
        userEmail: userEmailHeader ?? userEmailQuery,
        workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
        hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
        policyKey,
        writePath,
      }),
    };
  }

  @Get('backup-readiness')
  async backupReadiness(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
  ) {
    return this.infrastructureProfileService.getBackupReadinessPolicy(
      tenantSlugHeader ?? tenantSlugQuery,
    );
  }

  @Post('backup-setup-preview')
  async backupSetupPreview(
    @Body()
    body: {
      tenantSlug?: string;
      values?: Record<string, unknown>;
      formValues?: Record<string, unknown>;
      decision?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
  ) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException(
        'Backup setup preview body must be a JSON object.',
      );
    }

    if (body.tenantSlug !== undefined && typeof body.tenantSlug !== 'string') {
      throw new BadRequestException(
        'Backup setup preview tenantSlug must be a string.',
      );
    }

    if (
      tenantSlugHeader !== undefined &&
      body.tenantSlug !== undefined &&
      tenantSlugHeader.trim().toLowerCase() !==
        body.tenantSlug.trim().toLowerCase()
    ) {
      throw new BadRequestException(
        'Backup setup preview tenant header and body must match.',
      );
    }

    if (body.values !== undefined && body.formValues !== undefined) {
      throw new BadRequestException(
        'Backup setup preview accepts either values or formValues, not both.',
      );
    }

    return this.infrastructureProfileService.previewBackupSetup({
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      values: body.values !== undefined ? body.values : (body.formValues ?? {}),
      decision: body.decision,
    });
  }

  @Get('credential-reference-blueprint')
  credentialReferenceBlueprint(@Query('connectorKey') connectorKey?: string) {
    return this.credentialReferences.getBlueprint(connectorKey);
  }

  @Post('credential-reference-preview')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  credentialReferencePreview(
    @Body()
    body: {
      tenantSlug?: string;
      workspaceSlug?: string;
      userEmail?: string;
      hostname?: string;
      connectorKey?: string;
      reference?: string;
      authMode?: string;
      ownershipMode?:
        | 'platform-provided'
        | 'tenant-provided'
        | 'affiliate-provided';
      label?: string;
      packagePolicy?: {
        allowTenantExternalCredentials?: boolean;
        allowPlatformBrokeredCredentials?: boolean;
      };
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
  ) {
    return this.credentialReferences.previewReference({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      hostname: forwardedHostHeader ?? hostHeader ?? body.hostname,
    });
  }

  @Get('connections')
  async connections(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
  ) {
    return {
      capability: 'integrations',
      status: 'resolved',
      connections: await this.connectionInstances.listTenantConnections(
        tenantSlugHeader ?? tenantSlugQuery,
      ),
    };
  }

  @Get('control-plane')
  async controlPlane(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('hostname') hostnameQuery?: string,
  ) {
    return this.integrationControlPlane.summarizeTenantControlPlane({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
    });
  }

  @Get('setup-session')
  async setupSession(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('connectorKey') connectorKey?: string,
    @Query('appDefinitionKey') appDefinitionKey?: string,
    @Query('adapterContractKey') adapterContractKey?: string,
    @Query('adapterInterfaceKey') adapterInterfaceKey?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Query('storagePolicyKey') storagePolicyKey?: string,
  ) {
    return this.integrationSetup.buildSetupSession({
      connectorKey,
      appDefinitionKey,
      adapterContractKey,
      adapterInterfaceKey,
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      storagePolicyKey,
    });
  }

  @Get('diagnostics')
  async diagnostics(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('connectionSlug') connectionSlug?: string,
    @Query('connectorKey') connectorKey?: string,
  ) {
    return this.integrationDiagnostics.diagnose({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
      connectionSlug,
      connectorKey,
    });
  }

  @Post('ai-draft')
  aiDraft(
    @Body()
    body: {
      connectorKey?: string;
      prompt?: string;
      tenantSlug?: string;
      workspaceSlug?: string;
      storagePolicyKey?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
  ) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException(
        'Integration AI draft body must be a JSON object.',
      );
    }

    const supportedFields = [
      'connectorKey',
      'prompt',
      'tenantSlug',
      'workspaceSlug',
      'storagePolicyKey',
    ] as const;
    const unknownFields = Object.keys(body)
      .filter(
        (field) =>
          !supportedFields.includes(field as (typeof supportedFields)[number]),
      )
      .sort();

    if (unknownFields.length > 0) {
      throw new BadRequestException(
        `Integration AI draft contains unsupported fields: ${unknownFields.join(', ')}.`,
      );
    }

    for (const field of supportedFields) {
      if (body[field] !== undefined && typeof body[field] !== 'string') {
        throw new BadRequestException(
          `Integration AI draft ${field} must be a string.`,
        );
      }
    }

    if (
      tenantSlugHeader !== undefined &&
      body.tenantSlug !== undefined &&
      tenantSlugHeader.trim().toLowerCase() !==
        body.tenantSlug.trim().toLowerCase()
    ) {
      throw new BadRequestException(
        'Integration AI draft tenant header and body must match.',
      );
    }

    if (
      workspaceSlugHeader !== undefined &&
      body.workspaceSlug !== undefined &&
      workspaceSlugHeader.trim().toLowerCase() !==
        body.workspaceSlug.trim().toLowerCase()
    ) {
      throw new BadRequestException(
        'Integration AI draft workspace header and body must match.',
      );
    }

    return this.integrationAiDrafting.draftFromNaturalLanguage({
      connectorKey: body.connectorKey,
      prompt: body.prompt,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      storagePolicyKey: body.storagePolicyKey,
    });
  }

  @Post('workflow/setup-drafts')
  saveSetupDraft(
    @Body()
    body: {
      tenantSlug?: string;
      workspaceSlug?: string;
      connectorKey?: string;
      prompt?: string;
      storagePolicyKey?: string;
      draftKey?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
  ) {
    return this.integrationWorkflow.saveSetupDraft({
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      connectorKey: body.connectorKey,
      prompt: body.prompt,
      storagePolicyKey: body.storagePolicyKey,
      draftKey: body.draftKey,
    });
  }

  @Post('workflow/diagnostic-runs')
  recordDiagnosticRun(
    @Body()
    body: {
      tenantSlug?: string;
      workspaceSlug?: string;
      connectionSlug?: string;
      connectorKey?: string;
      runKey?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
  ) {
    return this.integrationWorkflow.recordDiagnosticRun({
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      connectionSlug: body.connectionSlug,
      connectorKey: body.connectorKey,
      runKey: body.runKey,
    });
  }

  @Post('workflow/nl-deploy')
  async nlDeploy(
    @Body()
    body: {
      tenantSlug?: string;
      prompt?: string;
      connectorKey?: string;
      workspaceId?: string;
      workflowKey?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
  ) {
    if (!body.prompt?.trim()) {
      throw new BadRequestException('Missing prompt — vui lòng mô tả workflow bạn muốn tạo.');
    }

    // Resolve tenant
    const tenantSlug = (tenantSlugHeader ?? body.tenantSlug ?? 'tenant-aifut').trim().toLowerCase();
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new NotFoundException(`Tenant '${tenantSlug}' not found`);

    return this.integrationAwlGenerator.nlDeploy({
      tenantId: tenant.id,
      prompt: body.prompt,
      connectorKey: body.connectorKey,
      workspaceId: body.workspaceId,
      workflowKey: body.workflowKey,
    });
  }

  @Post('workflow/review-activation')
  reviewAndActivate(
    @Body()
    body: {
      tenantSlug?: string;
      workspaceSlug?: string;
      userEmail?: string;
      hostname?: string;
      connectionSlug?: string;
      reviewSummary?: string;
      activationMode?: 'manual-review' | 'verified-ready';
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
  ) {
    return this.integrationWorkflow.reviewAndActivate({
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      hostname: forwardedHostHeader ?? hostHeader ?? body.hostname,
      connectionSlug: body.connectionSlug,
      reviewSummary: body.reviewSummary,
      activationMode: body.activationMode,
    });
  }

  @Post('connections')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  async createConnection(
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      connectorKey?: string;
      name?: string;
      slug?: string;
      config?: Record<string, unknown>;
      secretsRef?: string;
      hostname?: string;
      storagePolicyKey?: string;
      mappingProfile?: {
        mode?: string;
        objects?: string[];
        fieldMappings?: Record<string, unknown>;
        eventMappings?: Record<string, unknown>;
        syncPolicy?: Record<string, unknown>;
      };
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
  ) {
    return this.connectionInstances.createConnection({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      hostname: forwardedHostHeader ?? hostHeader ?? body.hostname,
    });
  }

  @Post('connections/verify')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  verifyConnection(
    @Body()
    body: {
      tenantSlug?: string;
      workspaceSlug?: string;
      userEmail?: string;
      hostname?: string;
      connectionSlug?: string;
      verificationMode?: 'dry-run' | 'operator-check' | 'connector-probe';
      verificationNotes?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
  ) {
    return this.connectionInstances.verifyConnection({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      hostname: forwardedHostHeader ?? hostHeader ?? body.hostname,
    });
  }

  @Get('connections/health-timeline')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  connectionHealthTimeline(
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Query('connectionSlug') connectionSlug?: string,
  ) {
    return this.connectionInstances.getConnectionHealthTimeline({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      connectionSlug,
    });
  }

  @Post('connections/acknowledge-health-alert')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  acknowledgeConnectionHealthAlert(
    @Body()
    body: {
      tenantSlug?: string;
      workspaceSlug?: string;
      userEmail?: string;
      hostname?: string;
      connectionSlug?: string;
      note?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
  ) {
    return this.connectionInstances.acknowledgeHealthAlert({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      hostname: forwardedHostHeader ?? hostHeader ?? body.hostname,
    });
  }

  @Post('connections/suppress-health-alert')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  suppressConnectionHealthAlert(
    @Body()
    body: {
      tenantSlug?: string;
      workspaceSlug?: string;
      userEmail?: string;
      hostname?: string;
      connectionSlug?: string;
      note?: string;
      durationMinutes?: number;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
  ) {
    return this.connectionInstances.suppressHealthAlert({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      hostname: forwardedHostHeader ?? hostHeader ?? body.hostname,
    });
  }

  @Post('connections/unsuppress-health-alert')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  unsuppressConnectionHealthAlert(
    @Body()
    body: {
      tenantSlug?: string;
      workspaceSlug?: string;
      userEmail?: string;
      hostname?: string;
      connectionSlug?: string;
      note?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
  ) {
    return this.connectionInstances.unsuppressHealthAlert({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      hostname: forwardedHostHeader ?? hostHeader ?? body.hostname,
    });
  }

  @Post('connections/recovery-note')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  addConnectionRecoveryNote(
    @Body()
    body: {
      tenantSlug?: string;
      workspaceSlug?: string;
      userEmail?: string;
      hostname?: string;
      connectionSlug?: string;
      note?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
  ) {
    return this.connectionInstances.addRecoveryNote({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      hostname: forwardedHostHeader ?? hostHeader ?? body.hostname,
    });
  }

  @Post('connections/follow-up-assignment')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  assignConnectionHealthFollowUp(
    @Body()
    body: {
      tenantSlug?: string;
      workspaceSlug?: string;
      userEmail?: string;
      hostname?: string;
      connectionSlug?: string;
      assigneeEmail?: string;
      note?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
  ) {
    return this.connectionInstances.assignHealthFollowUp({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      hostname: forwardedHostHeader ?? hostHeader ?? body.hostname,
    });
  }

  @Post('connections/follow-up-notification')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  recordConnectionHealthFollowUpNotification(
    @Body()
    body: {
      tenantSlug?: string;
      workspaceSlug?: string;
      userEmail?: string;
      hostname?: string;
      connectionSlug?: string;
      channel?: string;
      recipient?: string;
      note?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
  ) {
    return this.connectionInstances.recordFollowUpNotification({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      hostname: forwardedHostHeader ?? hostHeader ?? body.hostname,
    });
  }

  @Post('connections/follow-up-state')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  updateConnectionHealthFollowUpState(
    @Body()
    body: {
      tenantSlug?: string;
      workspaceSlug?: string;
      userEmail?: string;
      hostname?: string;
      connectionSlug?: string;
      state?: string;
      note?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
  ) {
    return this.connectionInstances.updateFollowUpState({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      hostname: forwardedHostHeader ?? hostHeader ?? body.hostname,
    });
  }

  @Post('connections/alert-thresholds')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  updateConnectionHealthAlertThresholds(
    @Body()
    body: {
      tenantSlug?: string;
      workspaceSlug?: string;
      userEmail?: string;
      hostname?: string;
      connectionSlug?: string;
      immediateFailures?: number;
      repeatedFailures?: number;
      cooldownMinutes?: number;
      note?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
  ) {
    return this.connectionInstances.updateAlertThresholds({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      userEmail: userEmailHeader ?? body.userEmail,
      hostname: forwardedHostHeader ?? hostHeader ?? body.hostname,
    });
  }

  @Get('setup-blueprint')
  setupBlueprint(@Query('connectorKey') connectorKey?: string) {
    return {
      capability: 'integrations',
      status: 'foundation',
      setup: this.connectionInstances.getSetupBlueprint(connectorKey),
    };
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'integrations',
      roadmap: INTEGRATIONS_FOUNDATION_ROADMAP,
    };
  }
}
