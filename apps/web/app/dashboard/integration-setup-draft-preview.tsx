"use client";

import { useState, type FormEvent } from "react";

import { postJsonResult, type JsonResult } from "../../lib/runtime-data";

export type ConnectorOption = {
  key: string;
  name: string;
  category?: string;
};

export type IntegrationAiDraftResponse = {
  status?: string;
  connector?: ConnectorOption;
  inputContext?: {
    tenantSlug?: string | null;
    workspaceSlug?: string | null;
    storagePolicyKey?: string | null;
  };
  setupExecutionArtifact?: {
    artifactKey?: string;
    artifactStatus?: string;
    setupTrack?: string;
    customerExperienceGoal?: string;
    naturalLanguageGoal?: string;
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
    executionSteps?: Array<{
      actionKey?: string;
      actionOrder?: number;
      actionStatus?: string;
      owner?: string;
    }>;
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
  missingInformation?: string[];
  operatorQuestions?: string[];
};

type Props = {
  connectors: ConnectorOption[];
  initialResult: JsonResult<IntegrationAiDraftResponse>;
  initialRequest: {
    connectorKey: string;
    prompt: string;
    tenantSlug: string;
    workspaceSlug: string;
    storagePolicyKey: string;
  };
};

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  borderRadius: 10,
  border: "1px solid rgba(159,176,255,0.35)",
  background: "rgba(8,16,29,0.8)",
  color: "#f5f7ff",
  padding: "10px 12px",
};

const cardStyle = {
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.035)",
  borderRadius: 14,
  padding: 16,
};

export function IntegrationSetupDraftPreview({
  connectors,
  initialResult,
  initialRequest,
}: Props) {
  const [request, setRequest] = useState(initialRequest);
  const [result, setResult] =
    useState<JsonResult<IntegrationAiDraftResponse>>(initialResult);
  const [isLoading, setIsLoading] = useState(false);

  const artifact = result.data?.setupExecutionArtifact;
  const consumerContract = artifact?.consumerContract;

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setResult(
      await postJsonResult<IntegrationAiDraftResponse>(
        "/integrations/ai-draft",
        request,
        {
          "x-tenant-slug": request.tenantSlug,
          "x-workspace-slug": request.workspaceSlug,
        },
      ),
    );
    setIsLoading(false);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <form onSubmit={submitPreview} style={cardStyle}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>
          Describe the integration in natural language
        </div>
        <div style={{ marginTop: 8, color: "#c8d2ff", lineHeight: 1.6 }}>
          AIFUT converts the request into a reviewable execution artifact. This
          preview does not store credentials, activate connections, or perform
          external writes.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 12,
            marginTop: 16,
          }}
        >
          <label>
            <FieldLabel>Application</FieldLabel>
            <select
              aria-label="Application"
              value={request.connectorKey}
              onChange={(event) =>
                setRequest({ ...request, connectorKey: event.target.value })
              }
              style={fieldStyle}
            >
              {connectors.map((connector) => (
                <option key={connector.key} value={connector.key}>
                  {connector.name}
                </option>
              ))}
            </select>
          </label>
          <ReadOnlyField
            label="Tenant scope"
            value={request.tenantSlug}
          />
          <ReadOnlyField
            label="Workspace scope"
            value={request.workspaceSlug}
          />
          <ReadOnlyField
            label="Storage policy"
            value={request.storagePolicyKey}
          />
        </div>

        <label style={{ display: "block", marginTop: 12 }}>
          <FieldLabel>What should the application do?</FieldLabel>
          <textarea
            aria-label="What should the application do?"
            value={request.prompt}
            onChange={(event) =>
              setRequest({ ...request, prompt: event.target.value })
            }
            rows={4}
            style={{ ...fieldStyle, resize: "vertical" }}
          />
        </label>

        <button
          type="submit"
          disabled={isLoading}
          style={{
            marginTop: 14,
            border: 0,
            borderRadius: 10,
            padding: "10px 16px",
            background: isLoading ? "#56608a" : "#9fb0ff",
            color: "#08101d",
            fontWeight: 800,
            cursor: isLoading ? "wait" : "pointer",
          }}
        >
          {isLoading ? "Preparing preview..." : "Prepare integration preview"}
        </button>
      </form>

      {artifact ? (
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
                {consumerContract?.displaySummary?.title ??
                  "Integration setup review"}
              </div>
              <div
                style={{
                  marginTop: 8,
                  color: "#c8d2ff",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {consumerContract?.displaySummary?.subtitle ??
                  artifact.customerExperienceGoal ??
                  "Review before activation."}
              </div>
            </div>
            <strong style={{ color: "#9fb0ff", fontSize: 12 }}>
              {consumerContract?.displaySummary?.statusLabel ?? "Preview only"}
            </strong>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginTop: 16,
            }}
          >
            <Readout
              label="Connector"
              value={result.data?.connector?.name ?? "unknown"}
            />
            <Readout
              label="Contract"
              value={consumerContract?.contractVersion ?? "unavailable"}
            />
            <Readout
              label="Sync mode"
              value={artifact.dataContract?.syncMode ?? "manual-review"}
            />
            <Readout
              label="Activation"
              value={
                artifact.reviewBoundaries?.activationAllowed
                  ? "Allowed"
                  : "Blocked"
              }
            />
            <Readout
              label="Scope"
              value={`${result.data?.inputContext?.tenantSlug ?? "unresolved"} / ${result.data?.inputContext?.workspaceSlug ?? "unresolved"}`}
            />
            <Readout
              label="Storage policy"
              value={
                result.data?.inputContext?.storagePolicyKey ?? "unassigned"
              }
            />
          </div>

          <List
            title="Execution steps"
            items={artifact.executionSteps?.map(
              (step) =>
                `${step.actionOrder ?? "-"}. ${step.actionKey ?? "review"} (${step.owner ?? "operator"}, ${step.actionStatus ?? "required"})`,
            )}
          />
          <List title="Information still needed" items={result.data?.missingInformation} />
          <List title="Questions for the operator" items={result.data?.operatorQuestions} />
          <List title="Data objects" items={artifact.dataContract?.objects} />

          <div style={{ marginTop: 16, color: "#9fb0ff", fontSize: 13 }}>
            Safety: preview only / human review required / activation blocked /
            external actions disabled
          </div>
        </div>
      ) : (
        <div style={{ ...cardStyle, color: "#ffb4b4" }}>
          Preview unavailable: {result.error ?? "No integration draft returned"}.
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <span
      style={{
        display: "block",
        marginBottom: 6,
        color: "#9fb0ff",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <label>
      <FieldLabel>{label}</FieldLabel>
      <input
        aria-label={label}
        readOnly
        value={value}
        style={{ ...fieldStyle, color: "#c8d2ff", cursor: "not-allowed" }}
      />
    </label>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderLeft: "2px solid #9fb0ff", paddingLeft: 10 }}>
      <div style={{ color: "#9fb0ff", fontSize: 11 }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function List({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 800 }}>{title}</div>
      <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: "#c8d2ff" }}>
        {items.map((item) => (
          <li key={item} style={{ marginTop: 6 }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
