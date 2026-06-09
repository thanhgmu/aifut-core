"use client";

import { useMemo, useState, type FormEvent } from "react";

import { postJsonResult } from "../../lib/runtime-data";

export type BackupSetupFormField = {
  key?: string;
  fieldKey?: string;
  inputKey?: string;
  name?: string;
  label?: string;
  inputType?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  value?: string;
  defaultValue?: string;
  defaultChecked?: boolean;
  options?: Array<string | { value?: string; label?: string }>;
};

export type BackupSetupFormSection = {
  key?: string;
  sectionKey?: string;
  title?: string;
  purpose?: string;
  description?: string;
  fields?: BackupSetupFormField[];
};

export type BackupSetupFormSchema = {
  schemaVersion?: string;
  title?: string;
  inputGroups?: BackupSetupFormSection[];
  sections?: BackupSetupFormSection[];
  fields?: BackupSetupFormField[];
};

export type BackupSetupContract = {
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

export type BackupSetupIntent = {
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
  formSchema?: BackupSetupFormSchema;
  decisionProjection?: {
    status?: string;
    recordable?: boolean;
    persistenceAllowed?: boolean;
    schedulePersistenceAllowed?: boolean;
    restoreExecutionAllowed?: boolean;
    credentialStorageAllowed?: boolean;
    externalCloudWritesAllowed?: boolean;
  };
  persistenceDesignLock?: BackupSetupPersistenceDesignLock;
  persistencePrerequisiteReview?: BackupSetupPersistencePrerequisiteReview;
};

type BackupSetupPreviewResponse = {
  status?: string;
  preview?: {
    decisionStatus?: string;
    projectedOutcome?: string;
    requestedDecision?: string;
    reviewSummary?: BackupSetupReviewSummary;
    fieldReviews?: FieldReview[];
    inputSummary?: {
      requiredCount?: number;
      providedCount?: number;
      missingInputKeys?: string[];
      invalidInputKeys?: string[];
    };
    validationIssues?: string[];
    persistenceDesignLock?: BackupSetupPersistenceDesignLock;
    persistencePrerequisiteReview?: BackupSetupPersistencePrerequisiteReview;
  };
  safety?: {
    persistenceAllowed?: boolean;
    schedulePersistenceAllowed?: boolean;
    restoreExecutionAllowed?: boolean;
    credentialStorageAllowed?: boolean;
    externalCloudWritesAllowed?: boolean;
  };
};

type BackupSetupPersistenceDesignLock = {
  schemaVersion?: string;
  version?: string;
  migrationRequired?: boolean;
  requiresMigration?: boolean;
  lockedWriteZones?: Array<string | BackupSetupDesignLockItem>;
  proposedEntities?: Array<string | BackupSetupDesignLockItem>;
  proposedTables?: Array<string | BackupSetupDesignLockItem>;
  guardrailFlags?: BackupSetupDesignLockFlags;
  guardrails?: BackupSetupDesignLockFlags;
  flags?: BackupSetupDesignLockFlags;
};

type BackupSetupPersistencePrerequisiteReview = {
  reviewVersion?: string;
  sourceDesignLockVersion?: string;
  mode?: string;
  status?: string;
  writeReadiness?: string;
  migrationReadiness?: string;
  lockedWriteZoneCount?: number;
  proposedTableCount?: number;
  pendingReviewCount?: number;
  blockedGuardrails?: string[];
  requiredReviewItems?: Array<{
    table?: string;
    requirement?: string;
    status?: string;
  }>;
  acceptanceCriteriaCount?: number;
  nextSafeAction?: string;
  guardrails?: BackupSetupDesignLockFlags;
};

type BackupSetupDesignLockItem = {
  key?: string;
  name?: string;
  entity?: string;
  table?: string;
  zone?: string;
  status?: string;
  reason?: string;
};

type BackupSetupDesignLockFlags =
  | string[]
  | Record<string, boolean | string | number | null | undefined>;

type BackupSetupReviewSummary = {
  statusLabel?: string;
  status?: string;
  validationIssueCount?: number;
  missingInputCount?: number;
  invalidInputCount?: number;
  requiredActionCount?: number;
  recommendedActionCount?: number;
  previewOnly?: boolean;
  activationAllowed?: boolean;
  externalActionsAllowed?: boolean;
  persistenceAllowed?: boolean;
  schedulePersistenceAllowed?: boolean;
  restoreExecutionAllowed?: boolean;
  credentialStorageAllowed?: boolean;
  externalCloudWritesAllowed?: boolean;
  blockers?: string[];
  nextActions?: BackupSetupReviewAction[];
  decisionSummary?: {
    configuredCount?: number;
    unresolvedCount?: number;
    deferredCount?: number;
  };
  inputSummary?: {
    requiredCount?: number;
    providedCount?: number;
    missingInputKeys?: string[];
    invalidInputKeys?: string[];
  };
  safety?: {
    persistenceAllowed?: boolean;
    schedulePersistenceAllowed?: boolean;
    restoreExecutionAllowed?: boolean;
    credentialStorageAllowed?: boolean;
    externalCloudWritesAllowed?: boolean;
  };
};

type BackupSetupReviewAction = {
  actionKey?: string;
  actionOrder?: number;
  actionStatus?: string;
  reason?: string;
  missingInputKeys?: string[];
  invalidInputKeys?: string[];
};

type FieldReview = {
  fieldKey?: string;
  status?: string;
  issues?: string[];
};

type FieldDraft = Record<string, string | boolean>;

export function BackupSetupReviewPreview({
  setupContract,
  setupIntent,
}: {
  setupContract: BackupSetupContract;
  setupIntent?: BackupSetupIntent;
}) {
  const operatorActions = useMemo(
    () =>
      [
        setupIntent?.primaryDecisionKey ?? setupContract.primaryActionKey,
        ...(setupIntent?.allowedDecisions ?? []),
        ...(setupContract.requiredActionKeys ?? []),
        ...(setupContract.recommendedActionKeys ?? []),
      ].filter((actionKey, index, actionKeys): actionKey is string => {
        return Boolean(actionKey) && actionKeys.indexOf(actionKey) === index;
      }),
    [setupContract, setupIntent],
  );
  const formSections = useMemo(
    () =>
      buildBackupSetupFormSections(setupContract, setupIntent, operatorActions),
    [operatorActions, setupContract, setupIntent],
  );
  const [draft, setDraft] = useState<FieldDraft>(() =>
    buildFieldDraft(formSections),
  );
  const [previewResponse, setPreviewResponse] =
    useState<BackupSetupPreviewResponse>();
  const [endpointMessage, setEndpointMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const runtimeHandoff = setupContract.runtimeHandoff;
  const endpoint = getPostPreviewEndpoint(runtimeHandoff?.previewEndpoint);
  const decisionProjection = setupIntent?.decisionProjection;
  const preview = previewResponse?.preview;
  const reviewSummary = preview?.reviewSummary;
  const previewSafety = previewResponse?.safety;
  const persistenceDesignLock =
    setupIntent?.persistenceDesignLock ?? preview?.persistenceDesignLock;
  const persistencePrerequisiteReview =
    preview?.persistencePrerequisiteReview ??
    setupIntent?.persistencePrerequisiteReview;
  const requiredCount = countRequiredFields(formSections);
  const providedCount = countProvidedRequiredFields(formSections, draft);
  const invalidInputKeys =
    reviewSummary?.inputSummary?.invalidInputKeys ??
    preview?.inputSummary?.invalidInputKeys ??
    getInvalidInputKeys(preview?.fieldReviews);
  const missingInputKeys =
    reviewSummary?.inputSummary?.missingInputKeys ??
    preview?.inputSummary?.missingInputKeys ??
    getMissingInputKeys(preview?.fieldReviews);
  const previewRequiredCount =
    reviewSummary?.inputSummary?.requiredCount ??
    preview?.inputSummary?.requiredCount ??
    requiredCount;
  const previewProvidedCount =
    reviewSummary?.inputSummary?.providedCount ??
    preview?.inputSummary?.providedCount ??
    previewRequiredCount - missingInputKeys.length;

  function updateDraft(field: BackupSetupFormField, value: string | boolean) {
    setDraft((current) => ({
      ...current,
      [getBackupSetupFieldKey(field)]: value,
    }));
  }

  async function refreshPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!endpoint) {
      setEndpointMessage(
        "No POST preview endpoint is advertised yet; showing the local review draft.",
      );
      setPreviewResponse(undefined);
      return;
    }

    setIsLoading(true);
    setEndpointMessage("");

    const result = await postJsonResult<BackupSetupPreviewResponse>(endpoint, {
      previewOnly: true,
      intentKey: setupIntent?.intentKey ?? null,
      contractVersion: setupContract.contractVersion ?? null,
      decision: getSelectedDecision(setupIntent, setupContract, draft),
      values: draft,
    });

    setPreviewResponse(result.data ?? undefined);
    setEndpointMessage(
      result.error
        ? `Preview endpoint unavailable (${result.error}); keeping the local review draft.`
        : "Preview endpoint returned a review draft only.",
    );
    setIsLoading(false);
  }

  return (
    <form
      onSubmit={refreshPreview}
      style={{ ...cardStyle, padding: 14, marginTop: 16 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              color: "#9fb0ff",
              fontSize: 12,
              fontWeight: 800,
              marginBottom: 8,
            }}
          >
            Backup Center setup review
          </div>
          <div style={{ color: "#dfe6ff", fontSize: 14, lineHeight: 1.5 }}>
            Preview-only decisions from{" "}
            {setupIntent?.intentVersion ??
              setupContract.contractVersion ??
              "backup setup contract"}
            .
          </div>
        </div>
        <span style={{ color: "#9fb0ff", fontSize: 12, fontWeight: 800 }}>
          {reviewSummary?.statusLabel ??
            reviewSummary?.status ??
            preview?.decisionStatus ??
            previewResponse?.status ??
            setupIntent?.status ??
            setupContract.reviewStatus ??
            "review required"}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 8,
          marginTop: 14,
        }}
      >
        <Readout
          label="Intent key"
          value={setupIntent?.intentKey ?? "contract-only preview"}
        />
        <Readout
          label="Decision scope"
          value={setupIntent?.decisionScope ?? "backup-center-setup-preview"}
        />
        <Readout
          label="Input review"
          value={`${previewResponse ? previewProvidedCount : providedCount}/${previewResponse ? previewRequiredCount : requiredCount} required`}
        />
        <Readout
          label="Projected outcome"
          value={
            preview?.projectedOutcome ??
            reviewSummary?.statusLabel ??
            reviewSummary?.status ??
            setupIntent?.projectedOutcome ??
            setupContract.reviewStatus ??
            "operator-review"
          }
        />
      </div>

      <ReviewSummaryReadout reviewSummary={reviewSummary} />
      <PersistenceDesignLockReadout
        persistenceDesignLock={persistenceDesignLock}
      />
      <PersistencePrerequisiteReviewReadout
        prerequisiteReview={persistencePrerequisiteReview}
      />

      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {formSections.map((section) => (
          <div
            key={section.sectionKey ?? section.key ?? section.title}
            style={nestedCardStyle}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              <div>
                <div
                  style={{ color: "#dfe6ff", fontSize: 14, fontWeight: 800 }}
                >
                  {section.title ?? "Operator inputs"}
                </div>
                {(section.description ?? section.purpose) ? (
                  <div
                    style={{
                      color: "#c8d2ff",
                      fontSize: 12,
                      lineHeight: 1.5,
                      marginTop: 4,
                    }}
                  >
                    {section.description ?? section.purpose}
                  </div>
                ) : null}
              </div>
              <span style={{ color: "#9fb0ff", fontSize: 11, fontWeight: 800 }}>
                local preview
              </span>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {(section.fields ?? []).map((field) => (
                <BackupSetupFieldDraft
                  key={getBackupSetupFieldKey(field)}
                  field={field}
                  value={draft[getBackupSetupFieldKey(field)]}
                  onChange={(value) => updateDraft(field, value)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {operatorActions.length > 0 ? (
          operatorActions.map((actionKey) => (
            <button
              key={actionKey}
              disabled
              type="button"
              style={disabledActionStyle}
            >
              {actionKey}
            </button>
          ))
        ) : (
          <span style={{ color: "#c8d2ff", fontSize: 13 }}>
            No operator actions advertised.
          </span>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 8,
          marginTop: 14,
        }}
      >
        <PreviewFlag
          label="Recordable flag"
          allowed={decisionProjection?.recordable}
        />
        <PreviewFlag
          label="Persistence flag"
          allowed={
            reviewSummary?.persistenceAllowed ??
            reviewSummary?.safety?.persistenceAllowed ??
            previewSafety?.persistenceAllowed ??
            decisionProjection?.persistenceAllowed
          }
        />
        <PreviewFlag
          label="Schedule flag"
          allowed={
            reviewSummary?.schedulePersistenceAllowed ??
            reviewSummary?.safety?.schedulePersistenceAllowed ??
            previewSafety?.schedulePersistenceAllowed ??
            decisionProjection?.schedulePersistenceAllowed ??
            runtimeHandoff?.schedulePersistenceAllowed
          }
        />
        <PreviewFlag
          label="Restore flag"
          allowed={
            reviewSummary?.restoreExecutionAllowed ??
            reviewSummary?.safety?.restoreExecutionAllowed ??
            previewSafety?.restoreExecutionAllowed ??
            decisionProjection?.restoreExecutionAllowed ??
            runtimeHandoff?.restoreExecutionAllowed
          }
        />
        <PreviewFlag
          label="Credential flag"
          allowed={
            reviewSummary?.credentialStorageAllowed ??
            reviewSummary?.safety?.credentialStorageAllowed ??
            previewSafety?.credentialStorageAllowed ??
            decisionProjection?.credentialStorageAllowed
          }
        />
        <PreviewFlag
          label="Cloud-write flag"
          allowed={
            reviewSummary?.externalCloudWritesAllowed ??
            reviewSummary?.safety?.externalCloudWritesAllowed ??
            previewSafety?.externalCloudWritesAllowed ??
            decisionProjection?.externalCloudWritesAllowed ??
            runtimeHandoff?.externalCloudWritesAllowed
          }
        />
      </div>

      <InputGuidance
        missingInputKeys={missingInputKeys}
        invalidInputKeys={invalidInputKeys}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 14,
        }}
      >
        <button
          type="submit"
          disabled={isLoading}
          style={endpoint ? buttonStyle : secondaryButtonStyle}
        >
          {isLoading
            ? "Checking preview..."
            : endpoint
              ? "Refresh review preview"
              : "Review local draft"}
        </button>
        <span style={{ color: "#9fb0ff", fontSize: 12 }}>
          Endpoint: {endpoint ?? "not advertised for POST preview"}
        </span>
      </div>

      {endpointMessage ? (
        <div
          style={{
            marginTop: 10,
            color: "#c8d2ff",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {endpointMessage}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 12,
          color: "#c8d2ff",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        Preview controls only. This dashboard does not persist schedules, run
        restores, store credentials, or write to external cloud storage.
      </div>
    </form>
  );
}

function PersistenceDesignLockReadout({
  persistenceDesignLock,
}: {
  persistenceDesignLock?: BackupSetupPersistenceDesignLock;
}) {
  if (!persistenceDesignLock) {
    return null;
  }

  return (
    <div
      style={{ ...nestedCardStyle, display: "grid", gap: 10, marginTop: 14 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ color: "#dfe6ff", fontSize: 14, fontWeight: 800 }}>
          Persistence design lock
        </div>
        <span style={{ color: "#9fb0ff", fontSize: 11, fontWeight: 800 }}>
          preview-only readout
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 8,
        }}
      >
        <CompactReadout
          label="Schema"
          value={
            persistenceDesignLock.schemaVersion ??
            persistenceDesignLock.version ??
            "not reported"
          }
        />
        <CompactReadout
          label="Migration"
          value={formatOptionalRequired(
            persistenceDesignLock.migrationRequired ??
              persistenceDesignLock.requiresMigration,
          )}
        />
        <CompactReadout
          label="Locked zones"
          value={formatDesignLockItems(persistenceDesignLock.lockedWriteZones)}
        />
        <CompactReadout
          label="Entities"
          value={formatDesignLockItems(persistenceDesignLock.proposedEntities)}
        />
        <CompactReadout
          label="Tables"
          value={formatDesignLockItems(persistenceDesignLock.proposedTables)}
        />
        <CompactReadout
          label="Guardrails"
          value={formatDesignLockFlags(
            persistenceDesignLock.guardrailFlags ??
              persistenceDesignLock.guardrails ??
              persistenceDesignLock.flags,
          )}
        />
      </div>
    </div>
  );
}

function PersistencePrerequisiteReviewReadout({
  prerequisiteReview,
}: {
  prerequisiteReview?: BackupSetupPersistencePrerequisiteReview;
}) {
  if (!prerequisiteReview) {
    return null;
  }

  const requiredReviewItems = prerequisiteReview.requiredReviewItems ?? [];
  const blockedGuardrails = prerequisiteReview.blockedGuardrails ?? [];

  return (
    <div
      style={{ ...nestedCardStyle, display: "grid", gap: 10, marginTop: 14 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ color: "#dfe6ff", fontSize: 14, fontWeight: 800 }}>
          Persistence prerequisite review
        </div>
        <span style={{ color: "#9fb0ff", fontSize: 11, fontWeight: 800 }}>
          {prerequisiteReview.mode ?? "preview-only"}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 8,
        }}
      >
        <CompactReadout
          label="Review"
          value={prerequisiteReview.reviewVersion ?? "not reported"}
        />
        <CompactReadout
          label="Status"
          value={prerequisiteReview.status ?? "review required"}
        />
        <CompactReadout
          label="Write readiness"
          value={prerequisiteReview.writeReadiness ?? "not-ready"}
        />
        <CompactReadout
          label="Migration"
          value={prerequisiteReview.migrationReadiness ?? "not-ready"}
        />
        <CompactReadout
          label="Pending review"
          value={`${prerequisiteReview.pendingReviewCount ?? requiredReviewItems.length} items`}
        />
        <CompactReadout
          label="Guardrails"
          value={`${blockedGuardrails.length} blocked`}
        />
      </div>

      {requiredReviewItems.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ color: "#9fb0ff", fontSize: 12, fontWeight: 800 }}>
            Required before writes
          </div>
          {requiredReviewItems.slice(0, 6).map((item, index) => (
            <div
              key={`${item.table ?? "table"}:${item.requirement ?? index}`}
              style={{ color: "#dfe6ff", fontSize: 13, lineHeight: 1.5 }}
            >
              {item.table ?? "backup table"} /{" "}
              {item.requirement ?? "review required"} /{" "}
              {item.status ?? "pending-review"}
            </div>
          ))}
        </div>
      ) : null}

      <CompactReadout
        label="Next safe action"
        value={
          prerequisiteReview.nextSafeAction ??
          "review-prisma-schema-and-migration-before-enabling-backup-persistence"
        }
      />
    </div>
  );
}

function buildBackupSetupFormSections(
  setupContract: BackupSetupContract,
  setupIntent: BackupSetupIntent | undefined,
  operatorActions: string[],
): BackupSetupFormSection[] {
  const schemaSections = [
    ...(setupIntent?.formSchema?.inputGroups ?? []),
    ...(setupIntent?.formSchema?.sections ?? []),
  ].filter((section) => (section.fields ?? []).length > 0);

  if (schemaSections.length > 0) {
    return schemaSections;
  }

  const schemaFields =
    setupIntent?.formSchema?.fields?.filter((field) =>
      getBackupSetupFieldKey(field),
    ) ?? [];

  if (schemaFields.length > 0) {
    return [
      {
        sectionKey: "schema-fields",
        title: setupIntent?.formSchema?.title ?? "Operator inputs",
        description: `Schema ${setupIntent?.formSchema?.schemaVersion ?? "preview"} rendered as local-only controls.`,
        fields: schemaFields,
      },
    ];
  }

  const requiredInputFields = (
    setupContract.runtimeHandoff?.requiredInputKeys ?? []
  ).map((inputKey) => ({
    fieldKey: inputKey,
    label: formatBackupSetupLabel(inputKey),
    inputType: "text",
    required: true,
    placeholder: "Operator input preview",
    helpText: "Required by the runtime handoff contract.",
  }));
  const decisionOptions = setupIntent?.allowedDecisions ?? [];
  const decisionField = {
    fieldKey:
      setupIntent?.primaryDecisionKey ??
      setupContract.primaryActionKey ??
      "backup-setup-decision",
    label: "Setup decision",
    inputType: decisionOptions.length > 0 ? "select" : "text",
    required: true,
    defaultValue:
      setupIntent?.defaultDecision ??
      decisionOptions[0] ??
      setupContract.reviewStatus ??
      "review-required",
    options: decisionOptions,
    helpText:
      "Preview-only decision selection. No state is recorded from this dashboard.",
  };
  const actionFields = operatorActions.map((actionKey) => ({
    fieldKey: `action:${actionKey}`,
    label: formatBackupSetupLabel(actionKey),
    inputType: "checkbox",
    defaultChecked: false,
    helpText: "Advertised setup action, shown for operator review only.",
  }));

  return [
    {
      sectionKey: "contract-derived-inputs",
      title: "Operator setup form scaffold",
      description:
        "Derived from the current setup contract until a setupIntent form schema is published.",
      fields: [decisionField, ...requiredInputFields, ...actionFields],
    },
  ];
}

function buildFieldDraft(sections: BackupSetupFormSection[]): FieldDraft {
  return sections.reduce<FieldDraft>((draft, section) => {
    for (const field of section.fields ?? []) {
      const fieldKey = getBackupSetupFieldKey(field);
      const inputType = field.inputType ?? field.type ?? "text";
      draft[fieldKey] =
        inputType === "checkbox"
          ? Boolean(field.defaultChecked)
          : (field.value ?? field.defaultValue ?? "");
    }

    return draft;
  }, {});
}

function BackupSetupFieldDraft({
  field,
  value,
  onChange,
}: {
  field: BackupSetupFormField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  const inputType = field.inputType ?? field.type ?? "text";
  const label =
    field.label ?? formatBackupSetupLabel(getBackupSetupFieldKey(field));
  const stringValue = typeof value === "string" ? value : "";
  const options = field.options ?? [];

  return (
    <label style={fieldRowStyle}>
      <span style={{ display: "grid", gap: 3 }}>
        <span style={{ fontWeight: 800 }}>
          {label}
          {field.required ? <span style={{ color: "#9fb0ff" }}> *</span> : null}
        </span>
        {field.helpText ? (
          <span style={{ color: "#c8d2ff", fontSize: 11, lineHeight: 1.4 }}>
            {field.helpText}
          </span>
        ) : null}
      </span>
      {inputType === "select" ? (
        <select
          value={stringValue}
          onChange={(event) => onChange(event.target.value)}
          style={controlStyle}
        >
          {options.length > 0 ? (
            options.map((option) => {
              const optionValue =
                typeof option === "string"
                  ? option
                  : (option.value ?? option.label ?? "");

              return (
                <option key={optionValue} value={optionValue}>
                  {typeof option === "string"
                    ? option
                    : (option.label ?? optionValue)}
                </option>
              );
            })
          ) : (
            <option>{stringValue || "preview option"}</option>
          )}
        </select>
      ) : inputType === "textarea" ? (
        <textarea
          value={stringValue}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          rows={2}
          style={controlStyle}
        />
      ) : inputType === "checkbox" ? (
        <input
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
          style={{ width: 18, height: 18, accentColor: "#9fb0ff" }}
        />
      ) : (
        <input
          value={stringValue}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder ?? "Preview-only"}
          type={inputType}
          style={controlStyle}
        />
      )}
    </label>
  );
}

function getBackupSetupFieldKey(field: BackupSetupFormField) {
  return (
    field.fieldKey ??
    field.inputKey ??
    field.key ??
    field.name ??
    field.label ??
    "backup-setup-field"
  );
}

function getPostPreviewEndpoint(previewEndpoint?: string) {
  if (!previewEndpoint) {
    return null;
  }

  const trimmedEndpoint = previewEndpoint.trim();
  if (/^GET\s+/i.test(trimmedEndpoint)) {
    return null;
  }

  return trimmedEndpoint.replace(/^POST\s+/i, "");
}

function getSelectedDecision(
  setupIntent: BackupSetupIntent | undefined,
  setupContract: BackupSetupContract,
  draft: FieldDraft,
) {
  const decisionKey =
    setupIntent?.primaryDecisionKey ?? setupContract.primaryActionKey;
  const selectedDecision = decisionKey ? draft[decisionKey] : undefined;

  return typeof selectedDecision === "string"
    ? selectedDecision
    : (setupIntent?.defaultDecision ??
        setupIntent?.allowedDecisions?.[0] ??
        null);
}

function countRequiredFields(sections: BackupSetupFormSection[]) {
  return sections.reduce(
    (count, section) =>
      count + (section.fields ?? []).filter((field) => field.required).length,
    0,
  );
}

function countProvidedRequiredFields(
  sections: BackupSetupFormSection[],
  draft: FieldDraft,
) {
  return sections.reduce((count, section) => {
    return (
      count +
      (section.fields ?? []).filter((field) => {
        if (!field.required) {
          return false;
        }

        const value = draft[getBackupSetupFieldKey(field)];
        return typeof value === "boolean" ? value : Boolean(value);
      }).length
    );
  }, 0);
}

function getInvalidInputKeys(fieldReviews?: FieldReview[]) {
  if (!Array.isArray(fieldReviews)) {
    return [];
  }

  return fieldReviews
    .filter(
      (review) =>
        review?.status === "invalid" &&
        !review.issues?.some((issue) => issue.endsWith(":required")),
    )
    .map((review) => review.fieldKey)
    .filter((fieldKey): fieldKey is string => Boolean(fieldKey));
}

function getMissingInputKeys(fieldReviews?: FieldReview[]) {
  if (!Array.isArray(fieldReviews)) {
    return [];
  }

  return fieldReviews
    .filter((review) =>
      review?.issues?.some((issue) => issue.endsWith(":required")),
    )
    .map((review) => review.fieldKey)
    .filter((fieldKey): fieldKey is string => Boolean(fieldKey));
}

function formatBackupSetupLabel(value: string) {
  return value
    .replace(/^action:/, "")
    .split(/[-_:]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function InputGuidance({
  missingInputKeys = [],
  invalidInputKeys = [],
}: {
  missingInputKeys?: string[];
  invalidInputKeys?: string[];
}) {
  if (missingInputKeys.length === 0 && invalidInputKeys.length === 0) {
    return null;
  }

  return (
    <div style={{ ...nestedCardStyle, display: "grid", gap: 8, marginTop: 14 }}>
      <div style={{ fontSize: 12, color: "#9fb0ff", fontWeight: 700 }}>
        Input guidance
      </div>
      {missingInputKeys.length > 0 ? (
        <div style={{ color: "#dfe6ff", fontSize: 13 }}>
          Missing required inputs: {missingInputKeys.join(", ")}
        </div>
      ) : null}
      {invalidInputKeys.length > 0 ? (
        <div style={{ color: "#dfe6ff", fontSize: 13 }}>
          Invalid inputs: {invalidInputKeys.join(", ")}
        </div>
      ) : null}
    </div>
  );
}

function ReviewSummaryReadout({
  reviewSummary,
}: {
  reviewSummary?: BackupSetupReviewSummary;
}) {
  if (!reviewSummary) {
    return null;
  }

  const decisionSummary = reviewSummary.decisionSummary;
  const nextActions = reviewSummary.nextActions ?? [];
  const blockers = reviewSummary.blockers ?? [];

  return (
    <div
      style={{ ...nestedCardStyle, display: "grid", gap: 10, marginTop: 14 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ color: "#dfe6ff", fontSize: 14, fontWeight: 800 }}>
          Review summary
        </div>
        <span style={{ color: "#9fb0ff", fontSize: 11, fontWeight: 800 }}>
          preview-only, no persistence
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 8,
        }}
      >
        <CompactReadout
          label="Status"
          value={
            reviewSummary.statusLabel ??
            reviewSummary.status ??
            "review required"
          }
        />
        <CompactReadout
          label="Validation"
          value={`${reviewSummary.validationIssueCount ?? 0} issues / ${reviewSummary.missingInputCount ?? 0} missing / ${reviewSummary.invalidInputCount ?? 0} invalid`}
        />
        <CompactReadout
          label="Actions"
          value={`${reviewSummary.requiredActionCount ?? 0} required / ${reviewSummary.recommendedActionCount ?? 0} recommended`}
        />
        <CompactReadout
          label="Activation"
          value={formatOptionalAllowed(reviewSummary.activationAllowed)}
        />
        <CompactReadout
          label="External actions"
          value={formatOptionalAllowed(reviewSummary.externalActionsAllowed)}
        />
        <CompactReadout
          label="Decisions"
          value={
            decisionSummary
              ? `${decisionSummary.configuredCount ?? 0} configured / ${decisionSummary.unresolvedCount ?? 0} unresolved / ${decisionSummary.deferredCount ?? 0} deferred`
              : "not summarized"
          }
        />
      </div>

      {nextActions.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ color: "#9fb0ff", fontSize: 12, fontWeight: 800 }}>
            Next operator actions
          </div>
          {nextActions.slice(0, 5).map((action, index) => (
            <div
              key={`${action.actionKey ?? "action"}:${action.actionOrder ?? index}`}
              style={{ color: "#dfe6ff", fontSize: 13, lineHeight: 1.5 }}
            >
              {action.actionOrder ?? index + 1}.{" "}
              {action.actionKey ?? "operator-action"} /{" "}
              {action.actionStatus ?? "required"}
              {action.reason ? ` / ${action.reason}` : ""}
              {formatActionInputIssues(action)}
            </div>
          ))}
        </div>
      ) : null}

      {blockers.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ color: "#9fb0ff", fontSize: 12, fontWeight: 800 }}>
            Blockers
          </div>
          {blockers.map((blocker) => (
            <div key={blocker} style={{ color: "#dfe6ff", fontSize: 13 }}>
              blocked: {blocker}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatOptionalAllowed(allowed?: boolean) {
  if (typeof allowed !== "boolean") {
    return "not reported";
  }

  return allowed ? "allowed" : "blocked";
}

function formatOptionalRequired(required?: boolean) {
  if (typeof required !== "boolean") {
    return "not reported";
  }

  return required ? "required" : "not required";
}

function formatDesignLockItems(
  items?: Array<string | BackupSetupDesignLockItem>,
) {
  if (!Array.isArray(items) || items.length === 0) {
    return "none reported";
  }

  return items.map(formatDesignLockItem).join(", ");
}

function formatDesignLockItem(item: string | BackupSetupDesignLockItem) {
  if (typeof item === "string") {
    return item;
  }

  const itemName =
    item.key ?? item.name ?? item.entity ?? item.table ?? item.zone ?? "item";
  const details = [item.status, item.reason].filter(Boolean).join(": ");

  return details ? `${itemName} (${details})` : itemName;
}

function formatDesignLockFlags(flags?: BackupSetupDesignLockFlags) {
  if (!flags) {
    return "none reported";
  }

  if (Array.isArray(flags)) {
    return flags.length > 0 ? flags.join(", ") : "none reported";
  }

  const formattedFlags = Object.entries(flags)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([flagKey, value]) => `${flagKey}: ${String(value)}`);

  return formattedFlags.length > 0
    ? formattedFlags.join(", ")
    : "none reported";
}

function formatActionInputIssues(action: BackupSetupReviewAction) {
  const missingInputKeys = action.missingInputKeys ?? [];
  const invalidInputKeys = action.invalidInputKeys ?? [];
  const issues = [
    missingInputKeys.length > 0
      ? `missing ${missingInputKeys.join(", ")}`
      : null,
    invalidInputKeys.length > 0
      ? `invalid ${invalidInputKeys.join(", ")}`
      : null,
  ].filter((issue): issue is string => Boolean(issue));

  return issues.length > 0 ? ` / ${issues.join(" / ")}` : "";
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
      <div
        style={{
          color: "#9fb0ff",
          fontSize: 11,
          fontWeight: 800,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ color: "#dfe6ff", fontSize: 13 }}>
        {allowed ? "contract: true" : "contract: false"}
      </div>
    </div>
  );
}

function CompactReadout({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          color: "#9fb0ff",
          fontSize: 11,
          fontWeight: 800,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#dfe6ff",
          fontSize: 13,
          lineHeight: 1.4,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...cardStyle, padding: 14 }}>
      <div
        style={{
          color: "#9fb0ff",
          fontSize: 12,
          fontWeight: 800,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#dfe6ff",
          fontSize: 14,
          lineHeight: 1.5,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

const fieldRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(140px, 0.42fr) minmax(180px, 1fr)",
  gap: 10,
  alignItems: "center",
  color: "#dfe6ff",
  fontSize: 13,
};

const controlStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  color: "#dfe6ff",
  fontSize: 13,
  padding: "8px 10px",
};

const disabledActionStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(159,176,255,0.1)",
  border: "1px solid rgba(159,176,255,0.22)",
  color: "#dfe6ff",
  fontSize: 12,
  fontWeight: 800,
  cursor: "not-allowed",
  opacity: 0.78,
};

const buttonStyle: React.CSSProperties = {
  padding: "11px 15px",
  borderRadius: 10,
  color: "#08101d",
  background: "#c8d2ff",
  border: 0,
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  color: "#dfe6ff",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
};

const cardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 18,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const nestedCardStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.08)",
};
