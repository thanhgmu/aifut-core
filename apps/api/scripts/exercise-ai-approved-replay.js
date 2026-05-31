require('dotenv/config');

const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3002';
const tenantSlug = process.env.AIFUT_PROOF_TENANT_SLUG || 'acme';
const workspaceSlug = process.env.AIFUT_PROOF_WORKSPACE_SLUG || 'ops';
const userEmail = process.env.AIFUT_PROOF_USER_EMAIL || 'ops@acme.test';
const planId =
  process.env.AIFUT_PROOF_PLAN_ID ||
  `plan:${tenantSlug}:${workspaceSlug}:approved-replay-proof:${Date.now()}`;
const headers = {
  'content-type': 'application/json',
  'x-tenant-slug': tenantSlug,
  'x-user-email': userEmail,
  'x-workspace-slug': workspaceSlug,
};

const runtimePayload = {
  objective: 'Verify AI-governance approved replay',
  executionModes: ['human-approved'],
  runtimeBindings: [
    {
      runtimeKey: 'openclaw',
      systemKey: 'ops-agent',
      deliveryMode: 'human-review',
      approvalRequired: true,
    },
  ],
  childWorkflowContracts: [
    {
      workflowKey: 'review-ops-brief',
      runtimeKey: 'openclaw',
      systemKey: 'ops-agent',
      triggerMode: 'human-review',
      approvalRequired: true,
      approvalCheckpointKey: 'approve-ops',
    },
  ],
  approvalContracts: [
    {
      checkpointKey: 'approve-ops',
      approverRole: 'operator',
      channel: 'web-ui',
      required: true,
    },
  ],
  submissionNotes: 'local approved replay proof',
};

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`${response.status} ${path}: ${JSON.stringify(body)}`);
  }

  return body;
}

async function post(path, body) {
  return request(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function main() {
  const encodedPlanId = encodeURIComponent(planId);
  const scopeQuery = new URLSearchParams({
    tenantSlug,
    workspaceSlug,
    userEmail,
  }).toString();

  const policy = await post('/ai-governance/routing-policies', {
    tenantSlug,
    workspaceSlug,
    featureKey: 'orchestration-runtime',
    taskType: 'dispatch-run',
    defaultLane: 'premium-model',
    maxLane: 'premium-model',
    preferredCredentialMode: 'aifut-managed',
    allowByoKeys: false,
    requireApprovalAboveLane: 'balanced-model',
    downgradeAtQuotaPressure: 'near-limit',
    cacheEnabled: true,
    deterministicFirst: false,
    source: 'local-approved-replay-proof',
  });
  const activation = await post(
    `/orchestration/plans/${encodedPlanId}/execution-runtime/activate`,
    runtimePayload,
  );
  const approval = await post(
    `/orchestration/plans/${encodedPlanId}/execution-runtime/approval-decision`,
    {
      ...runtimePayload,
      taskKey: `${planId}:approval:1:task`,
      decision: 'approve',
    },
  );
  const dispatch = await post(
    `/orchestration/plans/${encodedPlanId}/execution-runtime/dispatch-run`,
    {
      ...runtimePayload,
      runKey: `${planId}:child:1:runner:run`,
      aiGovernance: {
        requestedLane: 'premium-model',
        projectedTokens: 800,
        projectedCost: 0.25,
        approval: {
          decision: 'approve',
          note: 'local approved replay proof',
        },
      },
    },
  );
  const approvalHistory = await request(
    `/orchestration/plans/${encodedPlanId}/execution-runtime/approval-history?${scopeQuery}&limit=6`,
  );
  const diagnostics = await request(
    `/orchestration/plans/${encodedPlanId}/execution-runtime/diagnostics?${scopeQuery}`,
  );

  console.log(
    JSON.stringify(
      {
        ok:
          dispatch.status ===
            'execution-run-dispatched-after-ai-governance-approval' &&
          approvalHistory.approvalHistory?.count > 0 &&
          diagnostics.runtimeDiagnostics?.recentAiGovernanceOutcomes
            ?.latestOutcome?.outcome === 'approved-resumed',
        apiBase,
        planId,
        policyStatus: policy.status,
        activationStatus: activation.status,
        approvalStatus: approval.status,
        dispatchStatus: dispatch.status,
        approvalHistoryCount: approvalHistory.approvalHistory?.count ?? 0,
        approvedResumedCount:
          diagnostics.runtimeDiagnostics?.recentAiGovernanceOutcomes
            ?.approvedResumedCount ?? 0,
        latestOutcome:
          diagnostics.runtimeDiagnostics?.recentAiGovernanceOutcomes
            ?.latestOutcome ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
