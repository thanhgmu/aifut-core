import { API_BASE, getJson, getJsonResult, postJsonResult, type AdapterInterfaceRegistryResponse, type HealthResponse, type JsonResult } from "../../lib/runtime-data";
import { RuntimeBindingPreviewEditor } from "./runtime-binding-preview-editor";

type LaneCard = {
  lane: string;
  progress: string;
  done: string[];
  doing: string[];
  eta: string;
};

type BusinessSystemBlueprintPreviewResponse = {
  status?: string;
  businessSystemBlueprint?: {
    blueprintStatus?: string;
    businessLifecycle?: {
      phases?: Array<unknown>;
    };
    workflowGraph?: {
      nodes?: Array<unknown>;
      edges?: Array<unknown>;
    };
    appCoordination?: {
      systemAssignments?: Array<unknown>;
    };
    dataflow?: {
      edges?: Array<unknown>;
    };
    executionContractDraft?: {
      unboundChildWorkflowDrafts?: Array<unknown>;
      approvalContracts?: Array<unknown>;
    };
    reviewSummary?: {
      status?: string;
      activationAllowed?: boolean;
      blockers?: string[];
      nextActions?: Array<{
        actionKey?: string;
        actionOrder?: number;
        actionStatus?: string;
      }>;
      runtimeBindingSetupQueue?: Array<{
        setupKey?: string;
        workflowKey?: string;
        systemBoundaryKey?: string;
        approvalCheckpointKey?: string | null;
        setupMode?: string;
        setupStatus?: string;
        previewOnly?: boolean;
        requiredInputs?: Array<{
          inputKey?: string;
          inputType?: string;
          required?: boolean;
        }>;
      }>;
      decisionSummary?: {
        configuredCount?: number;
        unresolvedCount?: number;
        deferredCount?: number;
      };
    };
  };
};

type RuntimeBindingSetupQueueItem = NonNullable<
  NonNullable<
    NonNullable<
      BusinessSystemBlueprintPreviewResponse["businessSystemBlueprint"]
    >["reviewSummary"]
  >["runtimeBindingSetupQueue"]
>[number];

type RuntimeBindingSetupPreviewResponse = {
  status?: string;
  runtimeBindingSetupReview?: {
    setupKey?: string | null;
    setupMode?: string;
    reviewStatus?: string;
    previewOnly?: boolean;
    externalActionsAllowed?: boolean;
    activationAllowed?: boolean;
    blockers?: string[];
    nextActions?: Array<{
      actionKey?: string;
      actionStatus?: string;
      reason?: string;
      missingInputKeys?: string[];
      invalidInputKeys?: string[];
    }>;
    candidateRuntimeBinding?: {
      planId?: string;
      workflowKey?: string;
      systemBoundaryKey?: string;
      runtimeKey?: string;
      connectionKey?: string;
      triggerMode?: string;
      approvalCheckpointKey?: string | null;
    };
    inputSummary?: {
      requiredCount?: number;
      providedCount?: number;
      missingInputKeys?: string[];
      invalidInputKeys?: string[];
    };
  };
};

type IntegrationAiDraftResponse = {
  status?: string;
  connector?: {
    key?: string;
    name?: string;
    category?: string;
  };
  setupExecutionArtifact?: {
    artifactKey?: string;
    artifactStatus?: string;
    setupTrack?: string;
    customerExperienceGoal?: string;
    reviewBoundaries?: {
      previewOnly?: boolean;
      activationAllowed?: boolean;
      externalActionsAllowed?: boolean;
      requiresHumanReview?: boolean;
    };
    dataContract?: {
      connectorKey?: string;
      connectorName?: string;
      connectorCategory?: string;
      objects?: string[];
      syncMode?: string;
      storagePolicyKey?: string | null;
    };
    consumerContract?: {
      contractVersion?: string;
      sourceArtifactKey?: string;
      consumerSurfaces?: string[];
      reviewStatus?: string;
      displaySummary?: {
        title?: string;
        subtitle?: string;
        statusLabel?: string;
      };
      primaryActionKey?: string;
      requiredActionKeys?: string[];
      blockedActionKeys?: string[];
      runtimeBindingHandoff?: {
        mode?: string;
        setupKeySource?: string;
        previewEndpoint?: string;
        requiredInputKeys?: string[];
        activationAllowed?: boolean;
        externalActionsAllowed?: boolean;
      };
    };
  };
};

type BackupReadinessResponse = {
  status?: string;
  tenant?: {
    slug?: string;
    name?: string;
  };
  backup?: {
    status?: string;
    schedule?: {
      status?: string;
      supportedCadences?: string[];
      next?: string;
    };
    targets?: Array<{
      targetRef?: string;
      targetClass?: string;
      policyKeys?: string[];
    }>;
    blockers?: string[];
    recommendations?: string[];
    restore?: {
      status?: string;
      modes?: string[];
      approvalRequiredFor?: string[];
    };
    setupContract?: {
      contractVersion?: string;
      reviewStatus?: string;
      sourceSurface?: string;
      consumerSurfaces?: string[];
      displaySummary?: {
        title?: string;
        subtitle?: string;
        statusLabel?: string;
      };
      primaryActionKey?: string;
      requiredActionKeys?: string[];
      recommendedActionKeys?: string[];
      runtimeHandoff?: {
        mode?: string;
        previewEndpoint?: string;
        requiredInputKeys?: string[];
        schedulePersistenceAllowed?: boolean;
        restoreExecutionAllowed?: boolean;
        externalCloudWritesAllowed?: boolean;
        approvalRequiredFor?: string[];
      };
    };
    setupIntent?: {
      intentVersion?: string;
      sourceContractVersion?: string;
      mode?: string;
      intentKey?: string;
      status?: string;
      decisionScope?: string;
      primaryDecisionKey?: string;
      allowedDecisions?: string[];
      defaultDecision?: string;
      projectedOutcome?: string;
      decisionProjection?: {
        status?: string;
        recordable?: boolean;
        persistenceAllowed?: boolean;
        schedulePersistenceAllowed?: boolean;
        restoreExecutionAllowed?: boolean;
        credentialStorageAllowed?: boolean;
        externalCloudWritesAllowed?: boolean;
      };
    };
  };
};

type BackupSetupContract = NonNullable<
  NonNullable<NonNullable<BackupReadinessResponse["backup"]>["setupContract"]>
>;
type BackupSetupIntent = NonNullable<
  NonNullable<NonNullable<BackupReadinessResponse["backup"]>["setupIntent"]>
>;

type RootResponse = {
  focus?: {
    model?: string;
  };
};

const SAMPLE_BLUEPRINT_REQUEST = {
  tenantSlug: "acme",
  workspaceSlug: "ops",
  userEmail: "ops@acme.test",
  naturalLanguageBrief:
    "Build a Vietnam-first commerce operator system that finds products, validates suppliers, produces content, distributes campaigns, converts orders, fulfills customers, and feeds customer success evidence back into product discovery.",
  constraints: ["low-starting-capital", "approval-before-customer-impact"],
  preferredSystems: ["research-intelligence", "supplier-management", "content-workspace", "crm-commerce", "customer-support"],
  businessObjects: ["product-candidate", "supplier", "content-asset", "lead", "order", "customer-feedback"],
  priorities: ["time-to-first-sale", "operator-reviewability", "repeat-purchase-learning"],
  lanes: ["research", "content", "sales", "fulfillment", "support"],
};

const SAMPLE_INTEGRATION_DRAFT_REQUEST = {
  tenantSlug: "acme",
  workspaceSlug: "ops",
  storagePolicyKey: "assets",
  connectorKey: "nexovaflow",
  prompt:
    "Connect leads and tasks both ways so customers get faster follow-up, but keep writes reviewed first.",
};

const lanes: LaneCard[] = [
  {
    lane: "Platform kernel / tenancy",
    progress: "35%",
    done: [
      "tenant summary/current/resolve-host/storage-policy surfaces",
      "workspace + domain + package assignment foundations",
      "roadmap and kernel backlog surfaced in API",
    ],
    doing: [
      "deeper membership/role enforcement",
      "storage-topology and sovereignty hardening",
    ],
    eta: "2–5 weeks to stronger operator-ready foundation",
  },
  {
    lane: "Integration control plane",
    progress: "45%",
    done: [
      "connector registry + templates",
      "adapter contracts",
      "adapter interfaces with request/response shape + runtime binding hints",
      "setup-session and diagnostics groundwork",
    ],
    doing: [
      "interface-aware setup defaults",
      "runtime validation and persistence binding",
      "visible demo surfaces for operators",
    ],
    eta: "1–3 weeks to much stronger visible product proof",
  },
  {
    lane: "Orchestration / governed AI",
    progress: "30%",
    done: [
      "capabilities + roadmap surfaces",
      "execution contracts and runtime activation endpoints",
      "runtime history + diagnostics endpoints",
    ],
    doing: [
      "persistence-first runtime state handling",
      "approval/dispatch flow deepening",
    ],
    eta: "3–6 weeks to credible end-to-end operator demo",
  },
  {
    lane: "Product / GTM / investor story",
    progress: "60%",
    done: [
      "landing-page positioning sharpened",
      "go-to-market positioning doc added",
      "investor-partner story doc added",
    ],
    doing: [
      "turning narrative into visible product screens",
      "making kernel story legible in web demo",
    ],
    eta: "days, not weeks, for stronger demo packaging",
  },
];

async function getDashboardData() {
  const [
    health,
    adapterInterfacesResponse,
    root,
    blueprintPreviewResult,
    integrationDraftResult,
    backupReadinessResult,
  ] = await Promise.all([
    getJson<HealthResponse>("/health"),
    getJson<{ adapterInterfaces?: AdapterInterfaceRegistryResponse }>("/connectors/adapter-interfaces"),
    getJson<RootResponse>("/"),
    postJsonResult<BusinessSystemBlueprintPreviewResponse>(
      "/orchestration/business-systems/draft-preview",
      SAMPLE_BLUEPRINT_REQUEST,
    ),
    postJsonResult<IntegrationAiDraftResponse>(
      "/integrations/ai-draft",
      SAMPLE_INTEGRATION_DRAFT_REQUEST,
    ),
    getJsonResult<BackupReadinessResponse>(
      `/integrations/backup-readiness?tenantSlug=${SAMPLE_INTEGRATION_DRAFT_REQUEST.tenantSlug}`,
    ),
  ]);

  const adapterInterfaces = adapterInterfacesResponse?.adapterInterfaces;
  const runtimeBindingSetupPreviewResult = await getRuntimeBindingSetupPreviewResult(blueprintPreviewResult);

  return {
    health,
    adapterInterfaces,
    root,
    blueprintPreviewResult,
    integrationDraftResult,
    backupReadinessResult,
    runtimeBindingSetupPreviewResult,
  };
}

async function getRuntimeBindingSetupPreviewResult(
  blueprintPreviewResult: JsonResult<BusinessSystemBlueprintPreviewResponse>,
): Promise<JsonResult<RuntimeBindingSetupPreviewResponse>> {
  const setupCandidate =
    blueprintPreviewResult.data?.businessSystemBlueprint?.reviewSummary?.runtimeBindingSetupQueue?.[0];

  if (!setupCandidate) {
    return {
      data: null,
      status: null,
      error: "No setup candidate available",
    };
  }

  return postJsonResult<RuntimeBindingSetupPreviewResponse>(
    "/orchestration/business-systems/runtime-binding-setup-preview",
    buildRuntimeBindingSetupCandidate(setupCandidate),
  );
}

function buildRuntimeBindingSetupCandidate(setup: RuntimeBindingSetupQueueItem) {
  const workflowKey = setup.workflowKey ?? "workflow-draft";
  const systemBoundaryKey = setup.systemBoundaryKey ?? "system-boundary";

  return {
    tenantSlug: SAMPLE_BLUEPRINT_REQUEST.tenantSlug,
    workspaceSlug: SAMPLE_BLUEPRINT_REQUEST.workspaceSlug,
    userEmail: SAMPLE_BLUEPRINT_REQUEST.userEmail,
    planId: "plan:acme:ops:business-system-blueprint",
    setupKey: setup.setupKey,
    workflowKey,
    systemBoundaryKey,
    runtimeKey: `runtime:${systemBoundaryKey}`,
    connectionKey: `connection:${systemBoundaryKey}:operator-draft`,
    triggerMode: "manual-review",
    approvalCheckpointKey: setup.approvalCheckpointKey ?? null,
  };
}

export default async function DashboardPage() {
  const {
    health,
    adapterInterfaces,
    root,
    blueprintPreviewResult,
    integrationDraftResult,
    backupReadinessResult,
    runtimeBindingSetupPreviewResult,
  } =
    await getDashboardData();
  const interfaceCount = adapterInterfaces?.adapterInterfaces?.length ?? 0;
  const topInterfaces = Array.isArray(adapterInterfaces?.adapterInterfaces)
    ? adapterInterfaces.adapterInterfaces.slice(0, 3)
    : [];
  const blueprint = blueprintPreviewResult.data?.businessSystemBlueprint;
  const reviewSummary = blueprint?.reviewSummary;
  const blueprintPhaseCount = blueprint?.businessLifecycle?.phases?.length ?? 0;
  const blueprintNodeCount = blueprint?.workflowGraph?.nodes?.length ?? 0;
  const blueprintEdgeCount = blueprint?.workflowGraph?.edges?.length ?? 0;
  const blueprintAssignmentCount = blueprint?.appCoordination?.systemAssignments?.length ?? 0;
  const blueprintDataflowCount = blueprint?.dataflow?.edges?.length ?? 0;
  const childWorkflowCount = blueprint?.executionContractDraft?.unboundChildWorkflowDrafts?.length ?? 0;
  const approvalContractCount = blueprint?.executionContractDraft?.approvalContracts?.length ?? 0;
  const runtimeBindingSetupQueue = reviewSummary?.runtimeBindingSetupQueue ?? [];
  const runtimeBindingSetupReview = runtimeBindingSetupPreviewResult.data?.runtimeBindingSetupReview;
  const integrationArtifact = integrationDraftResult.data?.setupExecutionArtifact;
  const integrationConsumerContract = integrationArtifact?.consumerContract;
  const backupReadiness = backupReadinessResult.data?.backup;
  const backupSetupContract = backupReadiness?.setupContract;
  const backupSetupIntent = backupReadiness?.setupIntent;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #08101d 0%, #0d1730 100%)",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
        padding: "40px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1 }}>
              AIFUT execution dashboard
            </div>
            <h1 style={{ fontSize: 44, margin: "10px 0 12px" }}>Progress / now / next / ETA</h1>
            <p style={{ color: "#c8d2ff", fontSize: 18, lineHeight: 1.7, maxWidth: 860 }}>
              One-page live summary for the current local build, with yesterday&apos;s product ideas pushed into visible API/UI proof.
            </p>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
            <LinkButton href="/">Home</LinkButton>
            <LinkButton href="/foundation/demo-live">Visible demo</LinkButton>
            <LinkButton href="/foundation/operator-preview">Operator preview</LinkButton>
            <LinkButton href={`${API_BASE}/`}>API root</LinkButton>
            <LinkButton href={`${API_BASE}/health`}>Health</LinkButton>
            <LinkButton href={`${API_BASE}/connectors/adapter-interfaces`}>Adapter interfaces API</LinkButton>
            <LinkButton href={`${API_BASE}/connectors/adapter-contracts`}>Adapter contracts API</LinkButton>
            <LinkButton href={`${API_BASE}/connectors/templates`}>Templates API</LinkButton>
          </div>
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginTop: 28,
          }}
        >
          <MetricCard title="API" value={health?.status ?? "unknown"} note={`db: ${health?.database ?? "unknown"}`} />
          <MetricCard title="Model" value={health?.platform?.model ?? root?.focus?.model ?? "C"} note="kernel-first control plane" />
          <MetricCard title="Adapter interfaces" value={String(interfaceCount)} note="visible proof of connector abstraction" />
          <MetricCard title="Blueprint preview" value={blueprint?.blueprintStatus ?? "unavailable"} note={reviewSummary?.status ?? formatReadFailure(blueprintPreviewResult)} />
          <MetricCard title="Integration artifact" value={integrationArtifact?.artifactStatus ?? "unavailable"} note={integrationConsumerContract?.contractVersion ?? formatReadFailure(integrationDraftResult)} />
          <MetricCard title="Backup readiness" value={backupReadiness?.status ?? "unavailable"} note={backupSetupContract?.contractVersion ?? formatReadFailure(backupReadinessResult)} />
          <MetricCard title="Current theme" value="From narrative → product" note="docs + API + UI now connected" />
        </section>

        <section style={{ marginTop: 36 }}>
          <Panel title="Overall readout">
            <div style={{ display: "grid", gap: 10, color: "#dfe6ff", lineHeight: 1.7 }}>
              <div>• Foundation is real and running locally, not just conceptual.</div>
              <div>• Yesterday&apos;s &quot;future-forward&quot; lane is now anchored in adapter-interface contracts and visible local demo surfaces.</div>
              <div>• The next compounding win is turning these contracts into operator-facing setup/runtime flows.</div>
            </div>
          </Panel>
        </section>

        <section style={{ marginTop: 28 }}>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            Lane-by-lane status
          </div>
          <div style={{ display: "grid", gap: 18 }}>
            {lanes.map((lane) => (
              <Panel key={lane.lane} title={`${lane.lane} • ${lane.progress}`}>
                <LaneSection label="Done" items={lane.done} />
                <LaneSection label="Doing now" items={lane.doing} />
                <div style={{ marginTop: 14, color: "#9fb0ff", fontSize: 14 }}>ETA: {lane.eta}</div>
              </Panel>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 28 }}>
          <Panel title="Natural-language integration setup artifact">
            {integrationArtifact ? (
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                  <MetricCard title="Connector" value={integrationDraftResult.data?.connector?.name ?? "unknown"} note={integrationDraftResult.data?.connector?.category ?? "integration"} />
                  <MetricCard title="Artifact" value={integrationArtifact.artifactStatus ?? "review-ready"} note={integrationArtifact.setupTrack ?? "ai-assisted"} />
                  <MetricCard title="Contract" value={integrationConsumerContract?.contractVersion ?? "unavailable"} note={integrationConsumerContract?.reviewStatus ?? "review required"} />
                  <MetricCard title="Activation" value={integrationArtifact.reviewBoundaries?.activationAllowed ? "Allowed" : "Blocked"} note="preview-only setup artifact" />
                </div>

                <div style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>
                        {integrationConsumerContract?.displaySummary?.title ?? "Integration setup review"}
                      </div>
                      <div style={{ marginTop: 8, color: "#c8d2ff", fontSize: 13, lineHeight: 1.6 }}>
                        {integrationConsumerContract?.displaySummary?.subtitle ?? integrationArtifact.customerExperienceGoal ?? "Review before activation."}
                      </div>
                    </div>
                    <span style={{ color: "#9fb0ff", fontSize: 12, fontWeight: 800 }}>
                      {integrationConsumerContract?.displaySummary?.statusLabel ?? "Preview only"}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 16 }}>
                    <Readout label="Source artifact" value={integrationConsumerContract?.sourceArtifactKey ?? integrationArtifact.artifactKey ?? "unassigned"} />
                    <Readout label="Primary action" value={integrationConsumerContract?.primaryActionKey ?? "review"} />
                    <Readout label="Sync mode" value={integrationArtifact.dataContract?.syncMode ?? "manual-review"} />
                    <Readout label="Setup key source" value={integrationConsumerContract?.runtimeBindingHandoff?.setupKeySource ?? "runtime-binding queue"} />
                  </div>

                  <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                    <KeyList label="Required artifact actions" items={integrationConsumerContract?.requiredActionKeys} />
                    <KeyList label="Blocked until review" items={integrationConsumerContract?.blockedActionKeys} />
                    <KeyList label="Runtime-binding inputs" items={integrationConsumerContract?.runtimeBindingHandoff?.requiredInputKeys} />
                    <KeyList label="Consumer surfaces" items={integrationConsumerContract?.consumerSurfaces} />
                  </div>

                  <div style={{ marginTop: 16, color: "#9fb0ff", fontSize: 13, lineHeight: 1.6 }}>
                    Handoff: {integrationConsumerContract?.runtimeBindingHandoff?.previewEndpoint ?? "runtime-binding setup preview"} / activation {integrationConsumerContract?.runtimeBindingHandoff?.activationAllowed ? "allowed" : "blocked"} / external actions {integrationConsumerContract?.runtimeBindingHandoff?.externalActionsAllowed ? "allowed" : "disabled"}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: "#c8d2ff" }}>
                Integration setup artifact is unavailable: {formatReadFailure(integrationDraftResult)}.
              </div>
            )}
          </Panel>
        </section>

        <section style={{ marginTop: 28 }}>
          <Panel title="Backup Center readiness setup contract">
            {backupReadiness ? (
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                  <MetricCard title="Tenant" value={backupReadinessResult.data?.tenant?.name ?? "unknown"} note={backupReadinessResult.data?.tenant?.slug ?? "tenant"} />
                  <MetricCard title="Readiness" value={backupReadiness.status ?? "unknown"} note={backupReadiness.schedule?.status ?? "schedule pending"} />
                  <MetricCard title="Contract" value={backupSetupContract?.contractVersion ?? "unavailable"} note={backupSetupContract?.reviewStatus ?? "operator review"} />
                  <MetricCard title="Restore" value={backupReadiness.restore?.status ?? "manual"} note="approval-gated restore path" />
                </div>

                <div style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>
                        {backupSetupContract?.displaySummary?.title ?? "Backup readiness review"}
                      </div>
                      <div style={{ marginTop: 8, color: "#c8d2ff", fontSize: 13, lineHeight: 1.6 }}>
                        {backupSetupContract?.displaySummary?.subtitle ?? "Review backup coverage before schedules or restore execution are enabled."}
                      </div>
                    </div>
                    <span style={{ color: "#9fb0ff", fontSize: 12, fontWeight: 800 }}>
                      {backupSetupContract?.displaySummary?.statusLabel ?? "Setup needed"}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 16 }}>
                    <Readout label="Source surface" value={backupSetupContract?.sourceSurface ?? "GET /integrations/backup-readiness"} />
                    <Readout label="Primary action" value={backupSetupContract?.primaryActionKey ?? "review-backup-readiness"} />
                    <Readout label="Handoff mode" value={backupSetupContract?.runtimeHandoff?.mode ?? "preview-only"} />
                    <Readout label="Schedule persistence" value={backupSetupContract?.runtimeHandoff?.schedulePersistenceAllowed ? "allowed" : "blocked"} />
                  </div>

                  {backupSetupContract ? (
                    <BackupSetupIntentPreview setupContract={backupSetupContract} setupIntent={backupSetupIntent} />
                  ) : null}

                  <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                    <KeyList label="Required backup actions" items={backupSetupContract?.requiredActionKeys ?? backupReadiness.blockers} />
                    <KeyList label="Recommended setup actions" items={backupSetupContract?.recommendedActionKeys ?? backupReadiness.recommendations} />
                    <KeyList label="Restore approval gates" items={backupSetupContract?.runtimeHandoff?.approvalRequiredFor ?? backupReadiness.restore?.approvalRequiredFor} />
                    <KeyList label="Consumer surfaces" items={backupSetupContract?.consumerSurfaces} />
                  </div>

                  <div style={{ marginTop: 16, color: "#9fb0ff", fontSize: 13, lineHeight: 1.6 }}>
                    Handoff: {backupSetupContract?.runtimeHandoff?.previewEndpoint ?? "GET /integrations/backup-readiness"} / restore {backupSetupContract?.runtimeHandoff?.restoreExecutionAllowed ? "allowed" : "blocked"} / external cloud writes {backupSetupContract?.runtimeHandoff?.externalCloudWritesAllowed ? "allowed" : "disabled"}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: "#c8d2ff" }}>
                Backup readiness is unavailable: {formatReadFailure(backupReadinessResult)}.
              </div>
            )}
          </Panel>
        </section>

        <section style={{ marginTop: 28 }}>
          <Panel title="Natural-language business blueprint preview">
            {blueprint ? (
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  <MetricCard title="Lifecycle phases" value={String(blueprintPhaseCount)} note="closed-loop business flow" />
                  <MetricCard title="Graph" value={`${blueprintNodeCount}/${blueprintEdgeCount}`} note="nodes / edges" />
                  <MetricCard title="System assignments" value={String(blueprintAssignmentCount)} note={`${blueprintDataflowCount} dataflow edges`} />
                  <MetricCard title="Runtime bindings" value={String(childWorkflowCount)} note="child workflow drafts unbound" />
                  <MetricCard title="Approval contracts" value={String(approvalContractCount)} note="manual review before activation" />
                  <MetricCard title="Activation" value={reviewSummary?.activationAllowed ? "Allowed" : "Blocked"} note={reviewSummary?.status ?? "review required"} />
                </div>

                <div style={cardStyle}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>Operator setup queue</div>
                  <div style={{ marginTop: 8, color: "#c8d2ff", fontSize: 13 }}>
                    Configured {reviewSummary?.decisionSummary?.configuredCount ?? 0} / unresolved {reviewSummary?.decisionSummary?.unresolvedCount ?? 0} / deferred {reviewSummary?.decisionSummary?.deferredCount ?? 0}
                  </div>
                  <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                    {(reviewSummary?.nextActions ?? []).slice(0, 4).map((action) => (
                      <div key={action.actionKey} style={{ color: "#dfe6ff", lineHeight: 1.6 }}>
                        {action.actionOrder ?? "-"} / {action.actionKey ?? "unknown-action"} / {action.actionStatus ?? "required"}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                    {runtimeBindingSetupQueue.slice(0, 4).map((setup) => (
                      <div key={setup.setupKey ?? setup.workflowKey} style={{
                        padding: 12,
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.035)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <strong>{setup.workflowKey ?? "workflow"}</strong>
                          <span style={{ color: "#9fb0ff", fontSize: 12 }}>{setup.setupMode ?? setup.setupStatus ?? "required"}</span>
                        </div>
                        <div style={{ marginTop: 6, color: "#c8d2ff", fontSize: 13 }}>
                          Boundary: {setup.systemBoundaryKey ?? "unassigned"}{setup.approvalCheckpointKey ? ` / approval: ${setup.approvalCheckpointKey}` : ""}
                        </div>
                        <div style={{ marginTop: 8, color: "#9fb0ff", fontSize: 12 }}>
                          Inputs: {(setup.requiredInputs ?? []).map((input) => `${input.inputKey}${input.required ? "*" : ""}`).join(", ") || "pending"}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gap: 6, marginTop: 14, color: "#9fb0ff", fontSize: 13 }}>
                    {(reviewSummary?.blockers ?? []).map((blocker) => (
                      <div key={blocker}>blocked: {blocker}</div>
                    ))}
                  </div>
                </div>

                <RuntimeBindingPreviewEditor
                  queue={runtimeBindingSetupQueue}
                  initialReview={runtimeBindingSetupReview}
                  initialError={formatReadFailure(runtimeBindingSetupPreviewResult)}
                />
              </div>
            ) : (
              <div style={{ color: "#c8d2ff" }}>
                Blueprint preview is unavailable: {formatReadFailure(blueprintPreviewResult)}.
              </div>
            )}
          </Panel>
        </section>

        <section style={{ marginTop: 28 }}>
          <Panel title="Live local endpoints">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {[
                `${API_BASE}/`,
                `${API_BASE}/health`,
                `${API_BASE}/connectors/adapter-interfaces`,
                `${API_BASE}/connectors/adapter-contracts`,
                `${API_BASE}/connectors/templates`,
                `${API_BASE}/integrations/backup-readiness?tenantSlug=${SAMPLE_INTEGRATION_DRAFT_REQUEST.tenantSlug}`,
                `${API_BASE}/orchestration/business-systems/draft-preview`,
                `${API_BASE}/orchestration/business-systems/runtime-binding-setup-preview`,
              ].map((href) => (
                <a
                  key={href}
                  href={href}
                  style={{
                    color: "#c8d2ff",
                    textDecoration: "none",
                    padding: 14,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    wordBreak: "break-all",
                  }}
                >
                  {href}
                </a>
              ))}
            </div>
          </Panel>
        </section>

        <section style={{ marginTop: 28 }}>
          <Panel title="Yesterday's visible proof slice">
            {topInterfaces.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
                {topInterfaces.map((item: { key: string; appDefinitionKey: string; connectorKey: string; requestShape: string; responseShape: string; activationPolicy: string; runtimeBinding: string }) => (
                  <div key={item.key} style={cardStyle}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{item.key}</div>
                    <div style={{ marginTop: 6, color: "#9fb0ff", fontSize: 13 }}>{item.appDefinitionKey} • {item.connectorKey}</div>
                    <div style={{ marginTop: 14, fontSize: 14 }}>Request: <strong>{item.requestShape}</strong></div>
                    <div style={{ marginTop: 6, fontSize: 14 }}>Response: <strong>{item.responseShape}</strong></div>
                    <div style={{ marginTop: 10, fontSize: 13, color: "#c8d2ff" }}>Activation: {item.activationPolicy}</div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#c8d2ff" }}>Runtime: {item.runtimeBinding}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#c8d2ff" }}>Adapter interface data is unavailable right now.</div>
            )}
          </Panel>
        </section>
      </div>
    </main>
  );
}

function formatReadFailure(result: JsonResult<unknown>) {
  return result.error ?? (result.status ? `HTTP ${result.status}` : "read unavailable");
}

function BackupSetupIntentPreview({
  setupContract,
  setupIntent,
}: {
  setupContract: BackupSetupContract;
  setupIntent?: BackupSetupIntent;
}) {
  const runtimeHandoff = setupContract.runtimeHandoff;
  const operatorActions = [
    setupIntent?.primaryDecisionKey ?? setupContract.primaryActionKey,
    ...(setupIntent?.allowedDecisions ?? []),
    ...(setupContract.requiredActionKeys ?? []),
    ...(setupContract.recommendedActionKeys ?? []),
  ].filter((actionKey, index, actionKeys): actionKey is string => {
    return Boolean(actionKey) && actionKeys.indexOf(actionKey) === index;
  });
  const decisionProjection = setupIntent?.decisionProjection;

  return (
    <div style={{ ...cardStyle, padding: 14, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ color: "#9fb0ff", fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
            Operator setup intent
          </div>
          <div style={{ color: "#dfe6ff", fontSize: 14, lineHeight: 1.5 }}>
            Preview-only decisions from {setupIntent?.intentVersion ?? setupContract.contractVersion ?? "backup setup contract"}.
          </div>
        </div>
        <span style={{ color: "#9fb0ff", fontSize: 12, fontWeight: 800 }}>
          {setupIntent?.status ?? setupContract.reviewStatus ?? "review required"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 14 }}>
        <Readout label="Intent key" value={setupIntent?.intentKey ?? "contract-only preview"} />
        <Readout label="Decision scope" value={setupIntent?.decisionScope ?? "backup-center-setup-preview"} />
        <Readout label="Default decision" value={setupIntent?.defaultDecision ?? "review-required-actions"} />
        <Readout label="Projected outcome" value={setupIntent?.projectedOutcome ?? setupContract.reviewStatus ?? "operator-review"} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {operatorActions.length > 0 ? (
          operatorActions.map((actionKey) => (
            <button
              key={actionKey}
              disabled
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                background: "rgba(159,176,255,0.1)",
                border: "1px solid rgba(159,176,255,0.22)",
                color: "#dfe6ff",
                fontSize: 12,
                fontWeight: 800,
                cursor: "not-allowed",
                opacity: 0.78,
              }}
            >
              {actionKey}
            </button>
          ))
        ) : (
          <span style={{ color: "#c8d2ff", fontSize: 13 }}>No operator actions advertised.</span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginTop: 14 }}>
        <PreviewFlag label="Recordable flag" allowed={decisionProjection?.recordable} />
        <PreviewFlag label="Persistence flag" allowed={decisionProjection?.persistenceAllowed} />
        <PreviewFlag label="Schedule flag" allowed={decisionProjection?.schedulePersistenceAllowed ?? runtimeHandoff?.schedulePersistenceAllowed} />
        <PreviewFlag label="Restore flag" allowed={decisionProjection?.restoreExecutionAllowed ?? runtimeHandoff?.restoreExecutionAllowed} />
        <PreviewFlag label="Credential flag" allowed={decisionProjection?.credentialStorageAllowed} />
        <PreviewFlag label="Cloud-write flag" allowed={decisionProjection?.externalCloudWritesAllowed ?? runtimeHandoff?.externalCloudWritesAllowed} />
      </div>

      <div style={{ marginTop: 12, color: "#c8d2ff", fontSize: 12, lineHeight: 1.6 }}>
        Preview controls only. This dashboard does not persist schedules, run restores, or write to external cloud storage.
      </div>
    </div>
  );
}

function PreviewFlag({ label, allowed }: { label: string; allowed?: boolean }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ color: "#9fb0ff", fontSize: 11, fontWeight: 800, marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#dfe6ff", fontSize: 13 }}>{allowed ? "contract: true" : "contract: false"}</div>
    </div>
  );
}

function KeyList({ label, items = [] }: { label: string; items?: string[] }) {
  return (
    <div style={{ ...cardStyle, padding: 14 }}>
      <div style={{ color: "#9fb0ff", fontSize: 12, fontWeight: 800, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {items.length > 0 ? (
          items.map((item) => (
            <span
              key={item}
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#dfe6ff",
                fontSize: 12,
                overflowWrap: "anywhere",
              }}
            >
              {item}
            </span>
          ))
        ) : (
          <span style={{ color: "#c8d2ff", fontSize: 13 }}>unavailable</span>
        )}
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...cardStyle, padding: 14 }}>
      <div style={{ color: "#9fb0ff", fontSize: 12, fontWeight: 800, marginBottom: 8 }}>{label}</div>
      <div style={{ color: "#dfe6ff", fontSize: 14, lineHeight: 1.5, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

function MetricCard({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div>
      <div style={{ marginTop: 8, color: "#c8d2ff", fontSize: 13 }}>{note}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 22, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontSize: 13, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

function LaneSection({ label, items }: { label: string; items: string[] }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 13, color: "#9fb0ff", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "grid", gap: 6 }}>
        {items.map((item) => (
          <div key={item} style={{ color: "#dfe6ff", lineHeight: 1.6 }}>• {item}</div>
        ))}
      </div>
    </div>
  );
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        padding: "12px 16px",
        borderRadius: 12,
        textDecoration: "none",
        background: "rgba(255,255,255,0.06)",
        color: "white",
        fontWeight: 700,
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {children}
    </a>
  );
}

const cardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 18,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};
