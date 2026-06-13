import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IntegrationAiDraftingService } from './integration-ai-drafting.service';

describe('IntegrationAiDraftingService', () => {
  let service: IntegrationAiDraftingService;

  beforeEach(() => {
    service = new IntegrationAiDraftingService();
  });

  it('should turn a natural-language integration request into a reviewable setup execution artifact', () => {
    expect(
      service.draftFromNaturalLanguage({
        tenantSlug: 'Acme',
        workspaceSlug: 'Ops',
        storagePolicyKey: 'Assets',
        connectorKey: 'nexovaflow',
        prompt:
          'Connect leads and tasks both ways so customers get faster follow-up, but keep writes reviewed first.',
      }),
    ).toMatchObject({
      capability: 'integrations',
      surface: 'ai-drafting',
      status: 'drafted',
      connector: {
        key: 'nexovaflow',
        category: 'crm',
      },
      inputContext: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        storagePolicyKey: 'assets',
      },
      draft: {
        setupMode: 'ai-assisted',
        slug: 'nexovaflow-operations-connector-ops-draft',
        mappingProfile: {
          objects: expect.arrayContaining(['contacts', 'leads', 'tasks']),
          syncPolicy: {
            mode: 'bidirectional',
            verification: 'manual-before-enable',
            conflictResolution: 'review-before-write',
          },
        },
      },
      setupExecutionArtifact: {
        artifactKey:
          'integration-setup:ops:nexovaflow:nexovaflow-operations-connector-ops-draft',
        artifactType: 'natural-language-integration-setup',
        artifactStatus: 'review-ready',
        nonTechnicalMode: true,
        customerExperienceGoal:
          'Keep downstream customer interactions accurate, timely, and reviewable before automation is enabled.',
        reviewBoundaries: {
          previewOnly: true,
          activationAllowed: false,
          externalActionsAllowed: false,
          requiresHumanReview: true,
        },
        dataContract: {
          connectorKey: 'nexovaflow',
          connectorCategory: 'crm',
          syncMode: 'bidirectional',
          storagePolicyKey: 'assets',
        },
        executionSteps: [
          expect.objectContaining({
            actionKey: 'confirm-connection-scope',
            actionOrder: 1,
            actionStatus: 'required',
          }),
          expect.objectContaining({
            actionKey: 'collect-credential-reference',
            actionOrder: 2,
            actionStatus: 'required',
          }),
          expect.objectContaining({
            actionKey: 'review-mapping-profile',
            actionOrder: 3,
            actionStatus: 'required',
          }),
          expect.objectContaining({
            actionKey: 'run-diagnostics-before-activation',
            actionOrder: 4,
            actionStatus: 'required',
          }),
          expect.objectContaining({
            actionKey: 'submit-activation-review',
            actionOrder: 5,
            actionStatus: 'blocked-until-diagnostics-pass',
          }),
        ],
        consumerContract: {
          contractVersion: 'integration-setup-artifact.v1',
          sourceArtifactKey:
            'integration-setup:ops:nexovaflow:nexovaflow-operations-connector-ops-draft',
          consumerSurfaces: [
            'operator-ui-control-plane',
            'orchestration-runtime-binding',
            'local-runtime-reality-checks',
          ],
          reviewStatus: 'ready-for-operator-review',
          displaySummary: {
            title: 'NexovaFlow Operations Connector setup review',
            statusLabel: 'Preview only',
          },
          primaryActionKey: 'confirm-connection-scope',
          requiredActionKeys: [
            'confirm-connection-scope',
            'collect-credential-reference',
            'review-mapping-profile',
            'run-diagnostics-before-activation',
          ],
          blockedActionKeys: ['submit-activation-review'],
          runtimeBindingHandoff: {
            mode: 'preview-only',
            setupKeySource: 'orchestration-runtime-binding-setup-queue',
            previewEndpoint:
              'POST /orchestration/business-systems/runtime-binding-setup-preview',
            requiredInputKeys: [
              'planId',
              'workflowKey',
              'systemBoundaryKey',
              'runtimeKey',
              'connectionKey',
              'triggerMode',
            ],
            activationAllowed: false,
            externalActionsAllowed: false,
          },
        },
      },
      missingInformation: expect.not.arrayContaining([
        'workspace-scope-confirmation',
      ]),
      operatorQuestions: expect.not.arrayContaining([
        'Which workspace should own this integration?',
      ]),
    });
  });

  it('should reject missing prompt or unknown connectors', () => {
    expect(() =>
      service.draftFromNaturalLanguage({
        connectorKey: 'nexovaflow',
        prompt: '',
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.draftFromNaturalLanguage({
        connectorKey: 'unknown',
        prompt: 'connect leads',
      }),
    ).toThrow(NotFoundException);
  });

  it('should request workspace confirmation when scope is unresolved', () => {
    const result = service.draftFromNaturalLanguage({
      connectorKey: 'shopify',
      prompt: 'Connect customers and orders both ways.',
    });

    expect(result.missingInformation).toContain(
      'workspace-scope-confirmation',
    );
    expect(result.operatorQuestions).toContain(
      'Which workspace should own this integration?',
    );
  });

  it('should recognize Vietnamese integration intent without diacritics', () => {
    const result = service.draftFromNaturalLanguage({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      connectorKey: 'shopify',
      prompt:
        'Dong bo khach hang va don hang hai chieu, sau do tu dong hoa quy trinh ho tro.',
    });

    expect(result.inputContext.prompt).toContain('hai chieu');
    expect(result.draft.mappingProfile.syncPolicy.mode).toBe('bidirectional');
    expect(result.draft.workflowHints).toContain(
      'Consider adding workflow bridge handoff after initial sync succeeds.',
    );
  });

  it('should recognize and preserve Vietnamese integration intent with diacritics', () => {
    const prompt =
      'Đồng bộ khách hàng và đơn hàng hai chiều, sau đó tự động hóa quy trình hỗ trợ.';
    const result = service.draftFromNaturalLanguage({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      connectorKey: 'shopify',
      prompt,
    });

    expect(result.inputContext.prompt).toBe(prompt);
    expect(result.draft.mappingProfile.syncPolicy.mode).toBe('bidirectional');
    expect(result.draft.workflowHints).toContain(
      'Consider adding workflow bridge handoff after initial sync succeeds.',
    );
  });
});
