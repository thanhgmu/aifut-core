import process from "node:process";

const webBase = (process.argv[2] || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const apiBase = (
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:3002"
).replace(/\/$/, "");

async function readResponse(base, path) {
  const response = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }

  return response;
}

async function readJson(path) {
  return (await readResponse(apiBase, path)).json();
}

async function readHtml(path) {
  return (await readResponse(webBase, path)).text();
}

async function verifyBackupPreviewRejection() {
  const path = "/integrations/backup-setup-preview";
  const expectedMessage = "Backup setup preview tenantSlug must be a string.";
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantSlug: 42, values: {} }),
    signal: AbortSignal.timeout(5000),
  });
  const payload = await response.json();

  if (response.status !== 400) {
    throw new Error(`${path} returned HTTP ${response.status}, expected 400`);
  }

  if (payload?.message !== expectedMessage) {
    throw new Error(
      `${path} returned ${JSON.stringify(payload?.message)}, expected ${JSON.stringify(expectedMessage)}`,
    );
  }

  return { path, status: response.status, message: payload.message };
}

async function verifyBackupPreviewResolution() {
  const path = "/integrations/backup-setup-preview";
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantSlug: "acme",
      decision: "defer-setup",
      values: {
        targetClass: "user-local",
        targetRefPreview: "local://acme-backups",
        cadence: "daily",
        timezone: "Asia/Bangkok",
        retentionDays: 14,
        includedConfigScopes: ["workflows", "skills"],
        bundleFormat: "manifest-and-archive",
        approvalRequiredFor: ["database-snapshot"],
        approverRole: "owner",
      },
    }),
    signal: AbortSignal.timeout(5000),
  });
  const payload = await response.json();
  const safety = payload?.safety;
  const unsafeFlags = [
    "persistenceAllowed",
    "schedulePersistenceAllowed",
    "restoreExecutionAllowed",
    "credentialStorageAllowed",
    "externalCloudWritesAllowed",
    "databaseWritesAllowed",
  ].filter((key) => safety?.[key] !== false);

  if (!response.ok || payload?.status !== "resolved") {
    throw new Error(`${path} did not resolve a valid preview request`);
  }

  if (payload?.preview?.validationIssues?.length !== 0) {
    throw new Error(`${path} returned validation issues for valid inputs`);
  }

  if (
    payload?.preview?.inputSummary?.requiredCount !== 9 ||
    payload?.preview?.inputSummary?.providedCount !== 9
  ) {
    throw new Error(`${path} did not accept all nine required preview inputs`);
  }

  if (safety?.projectionOnly !== true || unsafeFlags.length > 0) {
    throw new Error(`${path} enabled safety flags: ${unsafeFlags.join(", ")}`);
  }

  return {
    path,
    status: response.status,
    previewStatus: payload.status,
    statusLabel: payload.preview.reviewSummary.statusLabel,
    requiredInputCount: payload.preview.inputSummary.requiredCount,
    providedInputCount: payload.preview.inputSummary.providedCount,
    safetyLocksVerified: 6,
  };
}

async function verifyIntegrationDraftPreview() {
  const path = "/integrations/ai-draft";
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-slug": "acme",
      "x-workspace-slug": "ops",
    },
    body: JSON.stringify({
      tenantSlug: "acme",
      workspaceSlug: "ops",
      storagePolicyKey: "assets",
      connectorKey: "shopify",
      prompt:
        "Đồng bộ khách hàng và đơn hàng hai chiều, sau đó tự động hóa quy trình hỗ trợ.",
    }),
    signal: AbortSignal.timeout(5000),
  });
  const payload = await response.json();
  const artifact = payload?.setupExecutionArtifact;
  const safety = artifact?.reviewBoundaries;
  const inputContext = payload?.inputContext;

  if (!response.ok || payload?.status !== "drafted") {
    throw new Error(`${path} did not draft a valid integration preview`);
  }

  if (artifact?.consumerContract?.contractVersion !== "integration-setup-artifact.v1") {
    throw new Error(`${path} returned an unexpected consumer contract`);
  }

  if (!Array.isArray(artifact?.executionSteps) || artifact.executionSteps.length !== 5) {
    throw new Error(`${path} did not return the five ordered execution steps`);
  }

  if (
    payload?.draft?.mappingProfile?.syncPolicy?.mode !== "bidirectional" ||
    !payload?.draft?.workflowHints?.includes(
      "Consider adding workflow bridge handoff after initial sync succeeds.",
    )
  ) {
    throw new Error(`${path} did not interpret Vietnamese automation intent`);
  }

  if (
    inputContext?.tenantSlug !== "acme" ||
    inputContext?.workspaceSlug !== "ops" ||
    inputContext?.storagePolicyKey !== "assets" ||
    inputContext?.prompt !==
      "Đồng bộ khách hàng và đơn hàng hai chiều, sau đó tự động hóa quy trình hỗ trợ."
  ) {
    throw new Error(`${path} did not preserve the requested integration input`);
  }

  if (
    safety?.previewOnly !== true ||
    safety?.requiresHumanReview !== true ||
    safety?.activationAllowed !== false ||
    safety?.externalActionsAllowed !== false
  ) {
    throw new Error(`${path} returned unsafe integration preview boundaries`);
  }

  return {
    path,
    status: response.status,
    connectorKey: payload.connector.key,
    contractVersion: artifact.consumerContract.contractVersion,
    executionStepCount: artifact.executionSteps.length,
    syncMode: payload.draft.mappingProfile.syncPolicy.mode,
    automationGuidance: true,
    vietnamesePromptPreserved: true,
    tenantSlug: inputContext.tenantSlug,
    workspaceSlug: inputContext.workspaceSlug,
    storagePolicyKey: inputContext.storagePolicyKey,
    scopeHeadersVerified: true,
    activationAllowed: safety.activationAllowed,
    externalActionsAllowed: safety.externalActionsAllowed,
  };
}

async function verifyIntegrationDraftRejection() {
  const path = "/integrations/ai-draft";
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-slug": "acme",
    },
    body: JSON.stringify({
      tenantSlug: "other",
      connectorKey: "shopify",
      prompt: "Connect orders both ways.",
    }),
    signal: AbortSignal.timeout(5000),
  });
  const payload = await response.json();

  if (
    response.status !== 400 ||
    payload?.message !==
      "Integration AI draft tenant header and body must match."
  ) {
    throw new Error(`${path} did not reject conflicting tenant scope`);
  }

  return { path, status: response.status, message: payload.message };
}

async function verifyIntegrationDraftUnknownFieldRejection() {
  const path = "/integrations/ai-draft";
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantSlug: "acme",
      workspaceSlug: "ops",
      connectorKey: "shopify",
      prompt: "Connect orders both ways.",
      storagePolicy: "assets",
    }),
    signal: AbortSignal.timeout(5000),
  });
  const payload = await response.json();

  if (
    response.status !== 400 ||
    payload?.message !==
      "Integration AI draft contains unsupported fields: storagePolicy."
  ) {
    throw new Error(`${path} did not reject an unsupported request field`);
  }

  return { path, status: response.status, message: payload.message };
}

async function verifyIntegrationScopeControls() {
  const path = "/dashboard";
  const html = await readHtml(path);
  requireText(html, path, "acme / ops");
  const controls = [
    { label: "Tenant scope", value: "acme" },
    { label: "Workspace scope", value: "ops" },
    { label: "Storage policy", value: "assets" },
  ];

  for (const control of controls) {
    const pattern = new RegExp(
      `aria-label="${control.label}"[^>]*readOnly=""[^>]*value="${control.value}"`,
    );

    if (!pattern.test(html)) {
      throw new Error(`${path} did not lock ${control.label}`);
    }
  }

  return { path, controls, initialPreviewScope: "acme / ops" };
}

function requireText(html, path, text) {
  if (!html.includes(text)) {
    throw new Error(`${path} did not render ${JSON.stringify(text)}`);
  }
}

function readMetric(html, title) {
  const titleMarker = `>${title}</div>`;
  const markerIndex = html.indexOf(titleMarker);

  if (markerIndex === -1) {
    throw new Error(`Metric ${JSON.stringify(title)} was not rendered`);
  }

  const valueHtml = html.slice(markerIndex + titleMarker.length);
  const valueMatch = valueHtml.match(/^<div[^>]*>([^<]+)<\/div>/);

  if (!valueMatch) {
    throw new Error(`Metric ${JSON.stringify(title)} has no rendered value`);
  }

  return valueMatch[1];
}

async function main() {
  const [
    interfacesResponse,
    contractsResponse,
    templatesResponse,
    integrationDraftPreview,
    integrationDraftRejection,
    integrationDraftUnknownFieldRejection,
    integrationScopeControls,
    backupPreviewRejection,
    backupPreviewResolution,
  ] =
    await Promise.all([
      readJson("/connectors/adapter-interfaces"),
      readJson("/connectors/adapter-contracts"),
      readJson("/connectors/templates"),
      verifyIntegrationDraftPreview(),
      verifyIntegrationDraftRejection(),
      verifyIntegrationDraftUnknownFieldRejection(),
      verifyIntegrationScopeControls(),
      verifyBackupPreviewRejection(),
      verifyBackupPreviewResolution(),
    ]);
  const interfaces = interfacesResponse?.adapterInterfaces?.adapterInterfaces;
  const contractNext = contractsResponse?.adapterContracts?.next;
  const templates = templatesResponse?.templates?.templates;

  if (!Array.isArray(interfaces) || interfaces.length === 0) {
    throw new Error("Connector API returned no adapter interfaces");
  }

  if (!Array.isArray(contractNext) || contractNext.length === 0) {
    throw new Error("Connector API returned no adapter contract roadmap items");
  }

  if (!Array.isArray(templates) || templates.length === 0) {
    throw new Error("Connector API returned no templates");
  }

  const pageExpectations = [
    ["/", "AIFUT"],
    ["/dashboard", "Describe the integration in natural language", "Tenant scope"],
    ["/foundation", "AIFUT Foundation"],
    ["/login", "AIFUT Login"],
    ["/register", "AIFUT Register"],
    ["/session", "Current Session"],
  ];
  const pageChecks = await Promise.all(
    pageExpectations.map(async ([path, expectedText, additionalText]) => {
      const html = await readHtml(path);
      requireText(html, path, expectedText);
      if (additionalText) {
        requireText(html, path, additionalText);
      }
      return { path, expectedText, additionalText };
    }),
  );
  const demoHtml = await readHtml("/foundation/demo-live");
  requireText(demoHtml, "/foundation/demo-live", interfaces[0].key);
  requireText(demoHtml, "/foundation/demo-live", contractNext[0]);

  const interfaceMetric = readMetric(demoHtml, "Adapter interfaces");
  const templateMetric = readMetric(demoHtml, "Templates");

  if (interfaceMetric !== String(interfaces.length)) {
    throw new Error(
      `Adapter interface metric ${interfaceMetric} did not match API count ${interfaces.length}`,
    );
  }

  if (templateMetric !== String(templates.length)) {
    throw new Error(
      `Template metric ${templateMetric} did not match API count ${templates.length}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        webBase,
        apiBase,
        pageChecks,
        liveDemo: {
          firstInterfaceKey: interfaces[0].key,
          firstContractRoadmapItem: contractNext[0],
          interfaceCount: interfaces.length,
          templateCount: templates.length,
        },
        integrationDraftPreview,
        integrationDraftRejection,
        integrationDraftUnknownFieldRejection,
        integrationScopeControls,
        backupPreviewRejection,
        backupPreviewResolution,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        webBase,
        apiBase,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
