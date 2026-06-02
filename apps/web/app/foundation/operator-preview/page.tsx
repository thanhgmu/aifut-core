import { API_BASE, getJsonResult, type HealthResponse, type JsonResult } from "../../../lib/runtime-data";

type ConnectionHealthResponse = {
  capability?: string;
  surface?: string;
  status?: string;
  connection?: {
    id?: string;
    name?: string;
    slug?: string;
    provider?: string;
    status?: string;
    lastVerifiedAt?: string | null;
    workspace?: {
      id?: string;
      name?: string;
      slug?: string;
    } | null;
  };
  latestVerification?: {
    verificationMode?: string;
    verifiedAt?: string;
    verificationNotes?: string;
    resultingStatus?: string;
  } | null;
  healthSummary?: {
    latestStatus?: string | null;
    repeatFailureCount?: number;
    recoveryStreak?: number;
    alertThresholds?: {
      immediateFailures?: number;
      repeatedFailures?: number;
      cooldownMinutes?: number;
    };
    cooldown?: {
      active?: boolean;
      remainingMinutes?: number;
      endsAt?: string | null;
    };
    suppression?: {
      active?: boolean;
      note?: string | null;
      until?: string | null;
    };
    recoveryNote?: {
      note?: string | null;
      recordedAt?: string | null;
      recordedBy?: string | null;
    };
    followUpAssignment?: {
      assigneeEmail?: string | null;
      assignedAt?: string | null;
      assignedBy?: string | null;
      note?: string | null;
    };
    followUpNotification?: {
      channel?: string | null;
      recipient?: string | null;
      recordedAt?: string | null;
      recordedBy?: string | null;
      note?: string | null;
    };
    followUpState?: {
      state?: string | null;
      updatedAt?: string | null;
      updatedBy?: string | null;
      note?: string | null;
    };
    shouldAlertOperator?: boolean;
    shouldEscalateOperator?: boolean;
  };
  healthTimeline?: Array<{
    type?: string;
    status?: string;
    at?: string;
    actor?: string;
    note?: string;
    detail?: Record<string, unknown>;
  }>;
  next?: string[];
};

type RuntimeDiagnosticsResponse = {
  capability?: string;
  status?: string;
  runtimeDiagnostics?: {
    planId?: string;
    historyStatus?: string;
    contextScope?: {
      tenantSlug?: string;
      workspaceSlug?: string | null;
    };
    diagnosticsSummary?: {
      snapshotCount?: number;
      eventCount?: number;
      latestSnapshotType?: string | null;
      latestRuntimeStatus?: string | null;
      latestRecordedAt?: string | null;
      latestEventType?: string | null;
      latestEventRecordedAt?: string | null;
      mutatedTargetCount?: number;
    };
    latestSnapshot?: {
      snapshotKey?: string;
      snapshotType?: string;
      runtimeStatus?: string;
      recordedAt?: string | null;
    } | null;
    latestEvent?: {
      eventKey?: string;
      eventType?: string;
      runtimeStatus?: string;
      recordedAt?: string | null;
    } | null;
    recentAiGovernanceOutcomes?: {
      recentOutcomeCount?: number;
      heldCount?: number;
      approvedResumedCount?: number;
      blockedCount?: number;
      autoDispatchedCount?: number;
      latestOutcome?: {
        eventKey?: string;
        outcome?: "held" | "approved-resumed" | "blocked" | "auto-dispatched";
        runKey?: string | null;
        runtimeStatus?: string;
        recordedAt?: string;
      } | null;
    };
  };
  next?: string[];
};

type ApprovalHistoryResponse = {
  capability?: string;
  status?: string;
  approvalHistory?: {
    capability?: string;
    status?: string;
    planId?: string;
    count?: number;
    approvalDispatchResumes?: Array<{
      id?: string;
      targetId?: string | null;
      createdAt?: string;
      user?: {
        id?: string;
        email?: string;
        name?: string | null;
      } | null;
      metadata?: {
        runKey?: string;
        approval?: {
          status?: string;
          decision?: string;
          approvedBy?: string;
          note?: string | null;
        };
        governanceDecision?: {
          selectedLane?: string | null;
          credentialMode?: string;
          approvalReason?: string | null;
        };
        usageEventKey?: string | null;
        actorContext?: {
          workspaceSlug?: string | null;
          membershipRole?: string | null;
        };
      };
    }>;
  };
  next?: string[];
};

type AiUsageSummaryResponse = {
  capability?: string;
  status?: string;
  summary?: {
    scope?: {
      tenantSlug?: string;
      workspaceSlug?: string | null;
    };
    featureKey?: string;
    taskType?: string;
    totals?: {
      totalTokens?: number;
      actualCost?: number;
      estimatedCost?: number;
      effectiveCost?: number;
    };
    recentEvents?: Array<{
      eventKey?: string;
      actorKey?: string;
      providerKey?: string;
      modelKey?: string;
      credentialMode?: string;
      executionLane?: string;
      totalTokens?: number;
      actualCost?: number;
      estimatedCost?: number;
      status?: string;
      source?: string;
      occurredAt?: string | null;
    }>;
  };
};

type DomainRoutingResponse = {
  capability?: string;
  status?: string;
  routing?: {
    tenant?: {
      id?: string;
      slug?: string;
      name?: string;
    };
    summary?: {
      domainCount?: number;
      routeReadyDomainCount?: number;
      attentionRequiredDomainCount?: number;
    };
    domains?: Array<{
      id?: string;
      hostname?: string;
      kind?: string;
      status?: string;
      isPrimary?: boolean;
      workspaceId?: string | null;
      workspace?: {
        name?: string;
        slug?: string;
      } | null;
      readiness?: {
        routeReady?: boolean;
        reasons?: string[];
      };
    }>;
  };
};

const SAMPLE_OPERATOR_CONTEXT = {
  tenantSlug: "acme",
  workspaceSlug: "ops",
  userEmail: "ops@acme.test",
  connectionSlug: "n8n-main",
  planId: "plan:acme:ops:live-runtime",
};

async function getOperatorPreviewData() {
  const params = new URLSearchParams({
    tenantSlug: SAMPLE_OPERATOR_CONTEXT.tenantSlug,
    workspaceSlug: SAMPLE_OPERATOR_CONTEXT.workspaceSlug,
    userEmail: SAMPLE_OPERATOR_CONTEXT.userEmail,
  });

  const [health, connectionHealth, runtimeDiagnostics, approvalHistory, aiUsageSummary, domainRouting] = await Promise.all([
    getJsonResult<HealthResponse>("/health"),
    getJsonResult<ConnectionHealthResponse>(
      `/integrations/connections/health-timeline?${new URLSearchParams({
        ...Object.fromEntries(params.entries()),
        connectionSlug: SAMPLE_OPERATOR_CONTEXT.connectionSlug,
      }).toString()}`,
    ),
    getJsonResult<RuntimeDiagnosticsResponse>(
      `/orchestration/plans/${SAMPLE_OPERATOR_CONTEXT.planId}/execution-runtime/diagnostics?${params.toString()}`,
    ),
    getJsonResult<ApprovalHistoryResponse>(
      `/orchestration/plans/${SAMPLE_OPERATOR_CONTEXT.planId}/execution-runtime/approval-history?${new URLSearchParams({
        ...Object.fromEntries(params.entries()),
        limit: "6",
      }).toString()}`,
    ),
    getJsonResult<AiUsageSummaryResponse>(
      `/ai-governance/usage-summary?${new URLSearchParams({
        ...Object.fromEntries(params.entries()),
        featureKey: "orchestration-runtime",
        taskType: "dispatch-run",
        take: "6",
      }).toString()}`,
    ),
    getJsonResult<DomainRoutingResponse>(
      `/integrations/domain-routing?tenantSlug=${SAMPLE_OPERATOR_CONTEXT.tenantSlug}`,
    ),
  ]);

  return {
    health: health.data,
    connectionHealth: connectionHealth.data,
    runtimeDiagnostics: runtimeDiagnostics.data,
    approvalHistory: approvalHistory.data,
    aiUsageSummary: aiUsageSummary.data,
    domainRouting: domainRouting.data,
    readResults: {
      health,
      connectionHealth,
      runtimeDiagnostics,
      approvalHistory,
      aiUsageSummary,
      domainRouting,
    },
  };
}

export default async function OperatorPreviewPage() {
  const { health, connectionHealth, runtimeDiagnostics, approvalHistory, aiUsageSummary, domainRouting, readResults } = await getOperatorPreviewData();
  const healthSummary = connectionHealth?.healthSummary;
  const timeline = Array.isArray(connectionHealth?.healthTimeline)
    ? connectionHealth.healthTimeline.slice(-4).reverse()
    : [];
  const runtimeSummary = runtimeDiagnostics?.runtimeDiagnostics?.diagnosticsSummary;
  const aiGovernanceOutcomes = runtimeDiagnostics?.runtimeDiagnostics?.recentAiGovernanceOutcomes;
  const approvalDispatchResumes = Array.isArray(approvalHistory?.approvalHistory?.approvalDispatchResumes)
    ? approvalHistory.approvalHistory.approvalDispatchResumes
    : [];
  const aiUsageEvents = Array.isArray(aiUsageSummary?.summary?.recentEvents)
    ? aiUsageSummary.summary.recentEvents
    : [];
  const domains = Array.isArray(domainRouting?.routing?.domains) ? domainRouting.routing.domains : [];
  const routeReadyDomainCount = domainRouting?.routing?.summary?.routeReadyDomainCount
    ?? domains.filter((domain) => domain.readiness?.routeReady).length;
  const attentionRequiredDomainCount = domainRouting?.routing?.summary?.attentionRequiredDomainCount
    ?? domains.filter((domain) => !domain.readiness?.routeReady).length;
  const failedReads = Object.entries(readResults).filter(([, result]) => !result.data);

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <a href="/foundation" style={backLinkStyle}>← Back to foundation</a>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginTop: 18 }}>
          <div>
            <div style={eyebrowStyle}>Operator control-plane preview</div>
            <h1 style={{ fontSize: 42, margin: "10px 0 12px" }}>Live operator truth from current APIs</h1>
            <p style={{ color: "#c8d2ff", fontSize: 18, lineHeight: 1.7, maxWidth: 860 }}>
              Smallest meaningful preview of what an operator can actually monitor today: connection health follow-up and orchestration runtime diagnostics, using only existing API behavior.
            </p>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
            <LinkButton href="/dashboard">Dashboard</LinkButton>
            <LinkButton href={`${API_BASE}/integrations/connections/health-timeline?tenantSlug=${SAMPLE_OPERATOR_CONTEXT.tenantSlug}&workspaceSlug=${SAMPLE_OPERATOR_CONTEXT.workspaceSlug}&userEmail=${encodeURIComponent(SAMPLE_OPERATOR_CONTEXT.userEmail)}&connectionSlug=${SAMPLE_OPERATOR_CONTEXT.connectionSlug}`}>Health timeline API</LinkButton>
            <LinkButton href={`${API_BASE}/orchestration/plans/${SAMPLE_OPERATOR_CONTEXT.planId}/execution-runtime/diagnostics?tenantSlug=${SAMPLE_OPERATOR_CONTEXT.tenantSlug}&workspaceSlug=${SAMPLE_OPERATOR_CONTEXT.workspaceSlug}&userEmail=${encodeURIComponent(SAMPLE_OPERATOR_CONTEXT.userEmail)}`}>Runtime diagnostics API</LinkButton>
            <LinkButton href={`${API_BASE}/orchestration/plans/${SAMPLE_OPERATOR_CONTEXT.planId}/execution-runtime/approval-history?tenantSlug=${SAMPLE_OPERATOR_CONTEXT.tenantSlug}&workspaceSlug=${SAMPLE_OPERATOR_CONTEXT.workspaceSlug}&userEmail=${encodeURIComponent(SAMPLE_OPERATOR_CONTEXT.userEmail)}&limit=6`}>Approval history API</LinkButton>
            <LinkButton href={`${API_BASE}/ai-governance/usage-summary?tenantSlug=${SAMPLE_OPERATOR_CONTEXT.tenantSlug}&workspaceSlug=${SAMPLE_OPERATOR_CONTEXT.workspaceSlug}&userEmail=${encodeURIComponent(SAMPLE_OPERATOR_CONTEXT.userEmail)}&featureKey=orchestration-runtime&taskType=dispatch-run&take=6`}>AI usage API</LinkButton>
            <LinkButton href={`${API_BASE}/integrations/domain-routing?tenantSlug=${SAMPLE_OPERATOR_CONTEXT.tenantSlug}`}>Domain routing API</LinkButton>
          </div>
        </div>

        <section style={metricGridStyle}>
          <MetricCard title="API" value={health?.status ?? "unknown"} note={`db: ${health?.database ?? "unknown"}`} />
          <MetricCard title="Connection status" value={connectionHealth?.connection?.status ?? "unavailable"} note={connectionHealth?.connection?.provider ?? "No provider surfaced"} />
          <MetricCard title="Operator alert" value={healthSummary?.shouldAlertOperator ? "Attention" : "Stable / none"} note={`repeat failures: ${healthSummary?.repeatFailureCount ?? 0}`} />
          <MetricCard title="Approval replays" value={String(approvalHistory?.approvalHistory?.count ?? 0)} note="persisted approval-dispatch resumes" />
          <MetricCard title="AI usage" value={formatTokenCount(aiUsageSummary?.summary?.totals?.totalTokens)} note={`${formatCost(aiUsageSummary?.summary?.totals?.effectiveCost)} effective cost`} />
          <MetricCard title="Domain routes" value={`${routeReadyDomainCount}/${domains.length}`} note={`${attentionRequiredDomainCount} need attention`} />
          <MetricCard title="HQ reads" value={failedReads.length === 0 ? "Healthy" : `${failedReads.length} unavailable`} note={failedReads.length === 0 ? "all preview reads returned data" : "inspect bounded read status below"} />
          <MetricCard title="Runtime history" value={runtimeDiagnostics?.runtimeDiagnostics?.historyStatus ?? "unknown"} note={`${runtimeSummary?.snapshotCount ?? 0} snapshots • ${runtimeSummary?.eventCount ?? 0} events`} />
        </section>

        {failedReads.length > 0 ? (
          <section style={{ marginTop: 18 }}>
            <Panel title="Bounded read status">
              <div style={{ display: "grid", gap: 10 }}>
                {failedReads.map(([name, result]) => (
                  <div key={name} style={timelineRowStyle}>
                    <StrongLine>{formatReadName(name)}</StrongLine>
                    <MutedLine>{formatReadFailure(result)}</MutedLine>
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        ) : null}

        <section style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 18 }}>
          <Panel title="Connection health command center">
            {connectionHealth ? (
              <div style={{ display: "grid", gap: 16 }}>
                <div style={infoCardStyle}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{connectionHealth.connection?.name ?? SAMPLE_OPERATOR_CONTEXT.connectionSlug}</div>
                  <div style={{ marginTop: 6, color: "#9fb0ff", fontSize: 13 }}>
                    {connectionHealth.connection?.slug ?? SAMPLE_OPERATOR_CONTEXT.connectionSlug} • workspace {connectionHealth.connection?.workspace?.slug ?? SAMPLE_OPERATOR_CONTEXT.workspaceSlug}
                  </div>
                  <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                    <DataPoint label="Latest status" value={healthSummary?.latestStatus ?? "N/A"} />
                    <DataPoint label="Recovery streak" value={String(healthSummary?.recoveryStreak ?? 0)} />
                    <DataPoint label="Escalate operator" value={healthSummary?.shouldEscalateOperator ? "Yes" : "No"} />
                    <DataPoint label="Last verified" value={formatDate(connectionHealth.connection?.lastVerifiedAt)} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <MiniPanel title="Follow-up owner">
                    <StrongLine>{healthSummary?.followUpAssignment?.assigneeEmail ?? "Unassigned"}</StrongLine>
                    <MutedLine>{formatDate(healthSummary?.followUpAssignment?.assignedAt)}</MutedLine>
                    <MutedLine>{healthSummary?.followUpAssignment?.note ?? "No operator note"}</MutedLine>
                  </MiniPanel>
                  <MiniPanel title="Follow-up state">
                    <StrongLine>{healthSummary?.followUpState?.state ?? "No active state"}</StrongLine>
                    <MutedLine>{formatDate(healthSummary?.followUpState?.updatedAt)}</MutedLine>
                    <MutedLine>{healthSummary?.followUpState?.note ?? "No workflow note"}</MutedLine>
                  </MiniPanel>
                  <MiniPanel title="Alert controls">
                    <StrongLine>{healthSummary?.suppression?.active ? "Suppressed" : "Live"}</StrongLine>
                    <MutedLine>
                      Thresholds: {healthSummary?.alertThresholds?.immediateFailures ?? "-"}/{healthSummary?.alertThresholds?.repeatedFailures ?? "-"}
                    </MutedLine>
                    <MutedLine>
                      Cooldown: {healthSummary?.cooldown?.active ? `${healthSummary?.cooldown?.remainingMinutes ?? 0} min left` : `${healthSummary?.alertThresholds?.cooldownMinutes ?? 0} min default`}
                    </MutedLine>
                  </MiniPanel>
                </div>

                <div>
                  <div style={sectionLabelStyle}>Recent health timeline</div>
                  {timeline.length > 0 ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      {timeline.map((entry, index) => (
                        <div key={`${entry.at ?? "time"}-${index}`} style={timelineRowStyle}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{entry.status ?? entry.type ?? "event"}</div>
                            <div style={{ color: "#9fb0ff", fontSize: 13 }}>{entry.type ?? "timeline"} • {formatDate(entry.at)}</div>
                          </div>
                          <div style={{ color: "#c8d2ff", fontSize: 13, maxWidth: 520, textAlign: "right" }}>
                            {entry.note ?? formatDetail(entry.detail)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="No connection health timeline returned for the sample operator context." />
                  )}
                </div>
              </div>
            ) : (
              <EmptyState message={`Connection health preview is unavailable: ${formatReadFailure(readResults.connectionHealth)}.`} />
            )}
          </Panel>

          <Panel title="Execution runtime diagnostics">
            {runtimeDiagnostics?.runtimeDiagnostics ? (
              <div style={{ display: "grid", gap: 14 }}>
                <DataPoint label="Plan" value={runtimeDiagnostics.runtimeDiagnostics.planId ?? SAMPLE_OPERATOR_CONTEXT.planId} />
                <DataPoint label="Tenant scope" value={runtimeDiagnostics.runtimeDiagnostics.contextScope?.tenantSlug ?? "N/A"} />
                <DataPoint label="Workspace scope" value={runtimeDiagnostics.runtimeDiagnostics.contextScope?.workspaceSlug ?? "tenant default"} />
                <DataPoint label="Latest runtime status" value={runtimeSummary?.latestRuntimeStatus ?? "N/A"} />
                <DataPoint label="Latest snapshot type" value={runtimeSummary?.latestSnapshotType ?? "N/A"} />
                <DataPoint label="Latest snapshot key" value={runtimeDiagnostics.runtimeDiagnostics.latestSnapshot?.snapshotKey ?? "N/A"} />
                <DataPoint label="Latest snapshot recorded" value={formatDate(runtimeDiagnostics.runtimeDiagnostics.latestSnapshot?.recordedAt)} />
                <DataPoint label="Latest event type" value={runtimeSummary?.latestEventType ?? "N/A"} />
                <DataPoint label="Latest event key" value={runtimeDiagnostics.runtimeDiagnostics.latestEvent?.eventKey ?? "N/A"} />
                <DataPoint label="Latest event status" value={runtimeDiagnostics.runtimeDiagnostics.latestEvent?.runtimeStatus ?? "N/A"} />
                <DataPoint label="Latest event recorded" value={formatDate(runtimeSummary?.latestEventRecordedAt)} />
                <DataPoint label="Persisted snapshots" value={String(runtimeSummary?.snapshotCount ?? 0)} />
                <DataPoint label="Persisted events" value={String(runtimeSummary?.eventCount ?? 0)} />
                <DataPoint label="Mutated targets" value={String(runtimeSummary?.mutatedTargetCount ?? 0)} />
                <DataPoint label="Last recorded" value={formatDate(runtimeSummary?.latestRecordedAt)} />

                <MiniPanel title="AI dispatch outcomes">
                  {aiGovernanceOutcomes ? (
                    <>
                      <StrongLine>{aiGovernanceOutcomes.recentOutcomeCount ?? 0} recent persisted outcomes</StrongLine>
                      <MutedLine>
                        held {aiGovernanceOutcomes.heldCount ?? 0} / approved-resumed {aiGovernanceOutcomes.approvedResumedCount ?? 0} / blocked {aiGovernanceOutcomes.blockedCount ?? 0} / auto-dispatched {aiGovernanceOutcomes.autoDispatchedCount ?? 0}
                      </MutedLine>
                      {aiGovernanceOutcomes.latestOutcome ? (
                        <>
                          <MutedLine>
                            Latest: {aiGovernanceOutcomes.latestOutcome.outcome ?? "unknown outcome"} / {aiGovernanceOutcomes.latestOutcome.runtimeStatus ?? "unknown status"} / {formatDate(aiGovernanceOutcomes.latestOutcome.recordedAt)}
                          </MutedLine>
                          <MutedLine>
                            Run: {aiGovernanceOutcomes.latestOutcome.runKey ?? "No run key recorded"}
                          </MutedLine>
                          <MutedLine>
                            Event: {aiGovernanceOutcomes.latestOutcome.eventKey ?? "No event key recorded"}
                          </MutedLine>
                        </>
                      ) : (
                        <MutedLine>No persisted AI dispatch outcomes were returned for this sample plan.</MutedLine>
                      )}
                    </>
                  ) : (
                    <MutedLine>AI dispatch outcome diagnostics are unavailable for this sample plan.</MutedLine>
                  )}
                </MiniPanel>

                <div style={infoCardStyle}>
                  <div style={sectionLabelStyle}>Operator readout</div>
                  <div style={{ display: "grid", gap: 8, color: "#dfe6ff", lineHeight: 1.7 }}>
                    <div>• Runtime history is {runtimeDiagnostics.runtimeDiagnostics.historyStatus ?? "unknown"} for this sample plan.</div>
                    <div>• Latest snapshot: {runtimeDiagnostics.runtimeDiagnostics.latestSnapshot?.snapshotType ?? "none"} / {runtimeDiagnostics.runtimeDiagnostics.latestSnapshot?.runtimeStatus ?? "N/A"}.</div>
                    <div>• Latest event: {runtimeDiagnostics.runtimeDiagnostics.latestEvent?.eventType ?? "none"}.</div>
                  </div>
                </div>

                <div>
                  <div style={sectionLabelStyle}>What this proves</div>
                  <div style={{ display: "grid", gap: 8, color: "#dfe6ff", lineHeight: 1.7 }}>
                    <div>• The operator surface can read persisted runtime truth without redefining orchestration semantics.</div>
                    <div>• The health lane and runtime lane can sit side by side in one control-plane preview.</div>
                    <div>• Missing data remains visible as a product gap, not a fake success state.</div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState message={`Runtime diagnostics are unavailable: ${formatReadFailure(readResults.runtimeDiagnostics)}.`} />
            )}
          </Panel>
        </section>

        <section style={{ marginTop: 18 }}>
          <Panel title="AI governance usage ledger">
            {aiUsageSummary?.summary ? (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  <DataPoint label="Feature" value={aiUsageSummary.summary.featureKey ?? "general"} />
                  <DataPoint label="Task" value={aiUsageSummary.summary.taskType ?? "general"} />
                  <DataPoint label="Tenant scope" value={aiUsageSummary.summary.scope?.tenantSlug ?? "N/A"} />
                  <DataPoint label="Workspace scope" value={aiUsageSummary.summary.scope?.workspaceSlug ?? "tenant default"} />
                  <DataPoint label="Recent events" value={String(aiUsageEvents.length)} />
                  <DataPoint label="Total tokens" value={formatTokenCount(aiUsageSummary.summary.totals?.totalTokens)} />
                  <DataPoint label="Actual cost" value={formatCost(aiUsageSummary.summary.totals?.actualCost)} />
                  <DataPoint label="Estimated cost" value={formatCost(aiUsageSummary.summary.totals?.estimatedCost)} />
                  <DataPoint label="Effective cost" value={formatCost(aiUsageSummary.summary.totals?.effectiveCost)} />
                </div>

                {aiUsageEvents.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {aiUsageEvents.map((event, index) => (
                      <div key={event.eventKey ?? `usage-${index}`} style={timelineRowStyle}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{event.executionLane ?? "unknown lane"} / {event.status ?? "unknown status"}</div>
                          <div style={{ color: "#9fb0ff", fontSize: 13 }}>
                            {event.providerKey ?? "unknown provider"} / {event.modelKey ?? "unknown model"} / {formatDate(event.occurredAt)}
                          </div>
                        </div>
                        <div style={{ color: "#c8d2ff", fontSize: 13, maxWidth: 680, textAlign: "right", lineHeight: 1.6 }}>
                          <div>{formatTokenCount(event.totalTokens)} tokens / actual {formatCost(event.actualCost)} / estimated {formatCost(event.estimatedCost)}</div>
                          <div>{event.credentialMode ?? "unknown credential mode"} / {event.actorKey ?? "unknown actor"}</div>
                          <div>source: {event.source ?? "unknown source"}</div>
                          <div>event: {event.eventKey ?? "No event key recorded"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState message="No persisted AI usage events were returned for the sample orchestration runtime." />
                )}
              </div>
            ) : (
              <EmptyState message={`AI governance usage summary is unavailable: ${formatReadFailure(readResults.aiUsageSummary)}.`} />
            )}
          </Panel>
        </section>

        <section style={{ marginTop: 18 }}>
          <Panel title="Domain routing readiness">
            {domainRouting?.routing ? (
              domains.length > 0 ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {domains.map((domain, index) => (
                    <div key={domain.id ?? `${domain.hostname ?? "domain"}-${index}`} style={timelineRowStyle}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{domain.hostname ?? "Unknown hostname"}</div>
                        <div style={{ color: "#9fb0ff", fontSize: 13 }}>
                          {domain.kind ?? "unknown kind"} / {formatDomainWorkspace(domain)}
                          {domain.isPrimary ? " / primary" : ""}
                        </div>
                      </div>
                      <div style={{ color: "#c8d2ff", fontSize: 13, maxWidth: 680, textAlign: "right", lineHeight: 1.6 }}>
                        <div>{domain.readiness?.routeReady ? "Route ready" : "Needs attention"}</div>
                        <div>{domain.readiness?.reasons?.join(", ") || "No readiness blockers"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="No domains were returned for the sample tenant context." />
              )
            ) : (
              <EmptyState message={`Domain routing readiness is unavailable: ${formatReadFailure(readResults.domainRouting)}.`} />
            )}
          </Panel>
        </section>

        <section style={{ marginTop: 18 }}>
          <Panel title="Recent approval-dispatch resumes">
            {approvalHistory?.approvalHistory ? (
              approvalDispatchResumes.length > 0 ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {approvalDispatchResumes.map((entry, index) => (
                    <div key={entry.id ?? `${entry.targetId ?? "run"}-${index}`} style={timelineRowStyle}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{entry.metadata?.runKey ?? entry.targetId ?? "Persisted run"}</div>
                        <div style={{ color: "#9fb0ff", fontSize: 13 }}>
                          {entry.metadata?.approval?.decision ?? "approval replay"} / {formatDate(entry.createdAt)}
                        </div>
                      </div>
                      <div style={{ color: "#c8d2ff", fontSize: 13, maxWidth: 680, textAlign: "right", lineHeight: 1.6 }}>
                        <div>
                          {entry.metadata?.governanceDecision?.selectedLane ?? "No lane recorded"}
                          {" / "}
                          {entry.metadata?.governanceDecision?.credentialMode ?? "No credential mode recorded"}
                        </div>
                        <div>
                          by {entry.metadata?.approval?.approvedBy ?? entry.user?.email ?? "unknown actor"}
                          {entry.metadata?.approval?.note ? ` / ${entry.metadata.approval.note}` : ""}
                        </div>
                        <div>
                          workspace {entry.metadata?.actorContext?.workspaceSlug ?? "tenant default"}
                          {" / "}
                          role {entry.metadata?.actorContext?.membershipRole ?? "unknown role"}
                        </div>
                        {entry.metadata?.governanceDecision?.approvalReason ? (
                          <div>{entry.metadata.governanceDecision.approvalReason}</div>
                        ) : null}
                        {entry.metadata?.usageEventKey ? <div>usage: {entry.metadata.usageEventKey}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="No persisted approval-dispatch resumes were returned for the sample plan context." />
              )
            ) : (
              <EmptyState message={`Approval replay history is unavailable: ${formatReadFailure(readResults.approvalHistory)}.`} />
            )}
          </Panel>
        </section>
      </div>
    </main>
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
    <div style={cardStyle}>
      <div style={sectionLabelStyle}>{title}</div>
      {children}
    </div>
  );
}

function MiniPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={infoCardStyle}>
      <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

function StrongLine({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 700, wordBreak: "break-word" }}>{children}</div>;
}

function MutedLine({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "#c8d2ff", fontSize: 13, lineHeight: 1.6 }}>{children}</div>;
}

function EmptyState({ message }: { message: string }) {
  return <div style={{ color: "#c8d2ff", lineHeight: 1.7 }}>{message}</div>;
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={{ padding: "10px 14px", borderRadius: 12, textDecoration: "none", background: "rgba(255,255,255,0.06)", color: "white", fontWeight: 700, border: "1px solid rgba(255,255,255,0.08)" }}>
      {children}
    </a>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTokenCount(value?: number) {
  return (value ?? 0).toLocaleString("en-US");
}

function formatCost(value?: number) {
  return `$${(value ?? 0).toFixed(4)}`;
}

function formatDetail(detail?: Record<string, unknown>) {
  if (!detail || Object.keys(detail).length === 0) {
    return "No extra detail";
  }

  const firstPair = Object.entries(detail)[0];
  if (!firstPair) return "No extra detail";
  return `${firstPair[0]}: ${String(firstPair[1])}`;
}

function formatDomainWorkspace(domain: {
  workspaceId?: string | null;
  workspace?: { name?: string; slug?: string } | null;
}) {
  if (!domain.workspaceId) return "tenant scope";
  if (!domain.workspace?.name) return `workspace ${domain.workspace?.slug ?? domain.workspaceId}`;
  return domain.workspace.slug
    ? `workspace ${domain.workspace.name} (${domain.workspace.slug})`
    : `workspace ${domain.workspace.name}`;
}

function formatReadFailure(result: JsonResult<unknown>) {
  if (result.status === 401 || result.status === 403) {
    return `Access denied (${result.error ?? `HTTP ${result.status}`})`;
  }

  return result.error ?? "No data returned";
}

function formatReadName(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #08101d 0%, #0d1730 100%)",
  color: "#f5f7ff",
  fontFamily: "Arial, sans-serif",
  padding: "40px 24px 80px",
};

const metricGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
  marginTop: 28,
};

const cardStyle: React.CSSProperties = {
  padding: 20,
  borderRadius: 18,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const infoCardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 16,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const timelineRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#9fb0ff",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 14,
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#9fb0ff",
  textTransform: "uppercase",
  letterSpacing: 1,
};

const backLinkStyle: React.CSSProperties = {
  color: "#9fb0ff",
  textDecoration: "none",
  fontSize: 14,
};
