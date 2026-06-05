"use client";

import { useState, type FormEvent } from "react";

import { postJsonResult } from "../../lib/runtime-data";

type SetupQueueItem = {
  setupKey?: string;
  workflowKey?: string;
  systemBoundaryKey?: string;
  approvalCheckpointKey?: string | null;
  setupMode?: string;
  setupStatus?: string;
};

type SetupReview = {
  setupKey?: string | null;
  expectedSetupKey?: string | null;
  reviewStatus?: string;
  previewOnly?: boolean;
  externalActionsAllowed?: boolean;
  activationAllowed?: boolean;
  operatorDecisionState?: {
    status?: string;
    decisionScope?: string;
    allowedDecisions?: string[];
    selectedDecision?: string | null;
    requiresActivationContract?: boolean;
    activationBoundary?: string;
    reviewGate?: string;
    auditIntentKey?: string | null;
  };
  blockers?: string[];
  nextActions?: Array<{
    actionKey?: string;
    actionStatus?: string;
    reason?: string;
    missingInputKeys?: string[];
    invalidInputKeys?: string[];
  }>;
  candidateRuntimeBinding?: {
    workflowKey?: string;
    systemBoundaryKey?: string;
    runtimeKey?: string;
    connectionKey?: string;
    triggerMode?: string;
  };
  inputSummary?: {
    requiredCount?: number;
    providedCount?: number;
    missingInputKeys?: string[];
    invalidInputKeys?: string[];
  };
};

type SetupPreviewResponse = {
  runtimeBindingSetupReview?: SetupReview;
};

type DraftFields = {
  runtimeKey: string;
  connectionKey: string;
  triggerMode: string;
  approvalCheckpointKey: string;
};

const MAX_DRAFT_LENGTH = 120;

export function RuntimeBindingPreviewEditor({
  queue,
  initialReview,
  initialError,
}: {
  queue: SetupQueueItem[];
  initialReview?: SetupReview;
  initialError: string;
}) {
  const boundedQueue = queue.slice(0, 4);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [draft, setDraft] = useState<DraftFields>(() =>
    buildDraftFields(boundedQueue[0], initialReview),
  );
  const [review, setReview] = useState(initialReview);
  const [error, setError] = useState(initialReview ? "" : initialError);
  const [isLoading, setIsLoading] = useState(false);
  const selectedSetup = boundedQueue[selectedIndex];

  function selectSetup(nextIndex: number) {
    const nextSetup = boundedQueue[nextIndex];
    setSelectedIndex(nextIndex);
    setDraft(buildDraftFields(nextSetup));
    setReview(undefined);
    setError("");
  }

  function updateDraft(field: keyof DraftFields, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function refreshPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSetup) {
      return;
    }

    setIsLoading(true);
    setError("");

    const result = await postJsonResult<SetupPreviewResponse>(
      "/orchestration/business-systems/runtime-binding-setup-preview",
      {
        tenantSlug: "acme",
        workspaceSlug: "ops",
        userEmail: "ops@acme.test",
        planId: "plan:acme:ops:business-system-blueprint",
        setupKey: selectedSetup.setupKey,
        workflowKey: selectedSetup.workflowKey,
        systemBoundaryKey: selectedSetup.systemBoundaryKey,
        runtimeKey: draft.runtimeKey,
        connectionKey: draft.connectionKey,
        triggerMode: draft.triggerMode,
        approvalCheckpointKey: draft.approvalCheckpointKey || null,
      },
    );

    setReview(result.data?.runtimeBindingSetupReview);
    setError(result.error ?? (result.status ? `HTTP ${result.status}` : ""));
    setIsLoading(false);
  }

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            Runtime binding setup review
          </div>
          <div style={{ marginTop: 8, color: "#c8d2ff", fontSize: 13 }}>
            Operator-editable draft. Refreshing calls the setup-preview endpoint
            only.
          </div>
        </div>
        <SafetyBadge label="Preview only" />
      </div>

      {selectedSetup ? (
        <form
          onSubmit={refreshPreview}
          style={{ display: "grid", gap: 14, marginTop: 16 }}
        >
          <label style={labelStyle}>
            Setup queue row
            <select
              value={selectedIndex}
              onChange={(event) => selectSetup(Number(event.target.value))}
              style={inputStyle}
            >
              {boundedQueue.map((setup, index) => (
                <option
                  key={setup.setupKey ?? setup.workflowKey ?? index}
                  value={index}
                >
                  {setup.workflowKey ?? `setup row ${index + 1}`} /{" "}
                  {setup.systemBoundaryKey ?? "unassigned"}
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <ReadOnlyField
              label="Workflow"
              value={selectedSetup.workflowKey ?? "unassigned"}
            />
            <ReadOnlyField
              label="System boundary"
              value={selectedSetup.systemBoundaryKey ?? "unassigned"}
            />
            <DraftInput
              label="Runtime key"
              value={draft.runtimeKey}
              onChange={(value) => updateDraft("runtimeKey", value)}
            />
            <DraftInput
              label="Connection key"
              value={draft.connectionKey}
              onChange={(value) => updateDraft("connectionKey", value)}
            />
            <label style={labelStyle}>
              Trigger mode
              <select
                value={draft.triggerMode}
                onChange={(event) =>
                  updateDraft("triggerMode", event.target.value)
                }
                style={inputStyle}
              >
                <option value="manual-review">manual-review</option>
                <option value="scheduled">scheduled</option>
                <option value="event-driven">event-driven</option>
              </select>
            </label>
            <DraftInput
              label="Approval checkpoint (optional)"
              value={draft.approvalCheckpointKey}
              onChange={(value) => updateDraft("approvalCheckpointKey", value)}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button type="submit" disabled={isLoading} style={buttonStyle}>
              {isLoading ? "Refreshing preview..." : "Refresh preview draft"}
            </button>
            <span style={{ color: "#9fb0ff", fontSize: 12 }}>
              No activation, persistence, or connector action is available here.
            </span>
          </div>
        </form>
      ) : (
        <div style={{ marginTop: 14, color: "#c8d2ff" }}>
          No setup queue row is available to preview.
        </div>
      )}

      {review ? (
        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <ReviewMetric
              title="Inputs"
              value={`${review.inputSummary?.providedCount ?? 0}/${review.inputSummary?.requiredCount ?? 0}`}
              note="candidate fields supplied"
            />
            <ReviewMetric
              title="Activation"
              value={review.activationAllowed ? "Allowed" : "Blocked"}
              note="preview review cannot activate"
            />
            <ReviewMetric
              title="External actions"
              value={review.externalActionsAllowed ? "Allowed" : "Disabled"}
              note="no connector side effects"
            />
            <ReviewMetric
              title="Decision"
              value={review.operatorDecisionState?.status ?? "Review required"}
              note="bounded operator state"
            />
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
              color: "#dfe6ff",
              lineHeight: 1.6,
            }}
          >
            <div>Review: {review.reviewStatus ?? "review required"}</div>
            <div>
              Decision scope:{" "}
              {review.operatorDecisionState?.decisionScope ?? "preview"}
            </div>
            <div>
              Allowed decisions:{" "}
              {(
                review.operatorDecisionState?.allowedDecisions ?? ["review"]
              ).join(", ")}
            </div>
            <div>Submitted setup key: {review.setupKey ?? "unassigned"}</div>
            <div>
              Expected setup key: {review.expectedSetupKey ?? "unavailable"}
            </div>
            <div>
              Runtime:{" "}
              {review.candidateRuntimeBinding?.runtimeKey ?? "unassigned"}
            </div>
            <div>
              Connection:{" "}
              {review.candidateRuntimeBinding?.connectionKey ?? "unassigned"}
            </div>
            <div>
              Trigger:{" "}
              {review.candidateRuntimeBinding?.triggerMode ?? "unassigned"}
            </div>
          </div>

          {review.operatorDecisionState ? (
            <div
              style={{
                ...nestedCardStyle,
                display: "grid",
                gap: 8,
                color: "#dfe6ff",
                fontSize: 13,
              }}
            >
              <div style={{ color: "#9fb0ff", fontWeight: 700 }}>
                Operator decision boundary
              </div>
              <div>{review.operatorDecisionState.reviewGate}</div>
              <div>{review.operatorDecisionState.activationBoundary}</div>
              <div>
                Audit intent:{" "}
                {review.operatorDecisionState.auditIntentKey ?? "unassigned"}
              </div>
            </div>
          ) : null}

          <InputGuidance
            missingInputKeys={review.inputSummary?.missingInputKeys}
            invalidInputKeys={review.inputSummary?.invalidInputKeys}
          />

          <div
            style={{ display: "grid", gap: 6, color: "#9fb0ff", fontSize: 13 }}
          >
            {(review.nextActions ?? []).map((action) => (
              <div key={action.actionKey}>
                next: {action.actionKey ?? "review"} /{" "}
                {action.actionStatus ?? "required"}
                {action.reason ? ` / ${action.reason}` : ""}
              </div>
            ))}
            {(review.blockers ?? []).map((blocker) => (
              <div key={blocker}>blocked: {blocker}</div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div style={{ marginTop: 14, color: "#c8d2ff" }}>
          Setup review is unavailable: {error}.
        </div>
      ) : null}
    </div>
  );
}

function buildDraftFields(
  setup?: SetupQueueItem,
  review?: SetupReview,
): DraftFields {
  const systemBoundaryKey = setup?.systemBoundaryKey ?? "system-boundary";

  return {
    runtimeKey:
      review?.candidateRuntimeBinding?.runtimeKey ??
      `runtime:${systemBoundaryKey}`,
    connectionKey:
      review?.candidateRuntimeBinding?.connectionKey ??
      `connection:${systemBoundaryKey}:operator-draft`,
    triggerMode:
      review?.candidateRuntimeBinding?.triggerMode ?? "manual-review",
    approvalCheckpointKey: setup?.approvalCheckpointKey ?? "",
  };
}

function DraftInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <input
        value={value}
        maxLength={MAX_DRAFT_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label style={labelStyle}>
      {label}
      <input
        value={value}
        readOnly
        style={{ ...inputStyle, color: "#9fb0ff" }}
      />
    </label>
  );
}

function ReviewMetric({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div style={nestedCardStyle}>
      <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, overflowWrap: "anywhere" }}>
        {value}
      </div>
      <div style={{ marginTop: 8, color: "#c8d2ff", fontSize: 13 }}>{note}</div>
    </div>
  );
}

function InputGuidance({
  missingInputKeys = [],
  invalidInputKeys = [],
}: {
  missingInputKeys?: string[];
  invalidInputKeys?: string[];
}) {
  if (missingInputKeys.length === 0 && invalidInputKeys.length === 0) {
    return (
      <div style={{ color: "#9fb0ff", fontSize: 13 }}>
        Input guidance: all required inputs are present and valid for operator
        review.
      </div>
    );
  }

  return (
    <div style={{ ...nestedCardStyle, display: "grid", gap: 8 }}>
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

function SafetyBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        alignSelf: "start",
        padding: "6px 10px",
        borderRadius: 999,
        color: "#b9c6ff",
        background: "rgba(126, 151, 255, 0.12)",
        border: "1px solid rgba(159, 176, 255, 0.28)",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 7,
  color: "#c8d2ff",
  fontSize: 12,
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 11px",
  borderRadius: 9,
  color: "#f5f7ff",
  background: "#111b34",
  border: "1px solid rgba(159,176,255,0.25)",
  font: "inherit",
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

const cardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 18,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const nestedCardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.08)",
};
