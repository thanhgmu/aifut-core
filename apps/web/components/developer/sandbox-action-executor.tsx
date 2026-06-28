"use client";

// ============================================================================
// components/developer/sandbox-action-executor.tsx
// Interactive Action Executor for Developer Sandbox sessions.
//
// Cho phép developer chạy thử các action type (AI_ROUTING, CONNECTOR_EXEC,
// WORKFLOW_RUN) với input payload tuỳ chỉnh, xem kết quả trace + virtual
// cost + latency real-time — KHÔNG chạm vào production data.
//
// Backend: POST /v1/sandbox/execute → SandboxService.executeSandboxIsolation
// ============================================================================

import { useCallback, useState } from "react";
import { executeSandboxAction } from "../../lib/sandbox";
import { formatLatency, formatSimulatedCredits } from "../../lib/sandbox-format";
import type { ExecuteResult } from "../../types/sandbox";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_OPTIONS: { value: string; label: string; description: string; suggested: string }[] = [
  {
    value: "AI_ROUTING",
    label: "🧠 AI Routing",
    description: "Test AI model routing & lane selection logic",
    suggested: JSON.stringify({ query: "test prompt", model: "gpt-4o-sandbox", temperature: 0.7 }, null, 2),
  },
  {
    value: "CONNECTOR_EXEC",
    label: "🔌 Connector Execute",
    description: "Simulate connector call with dry-run output",
    suggested: JSON.stringify({ endpoint: "/api/test", method: "GET", headers: { "Content-Type": "application/json" } }, null, 2),
  },
  {
    value: "WORKFLOW_RUN",
    label: "⚙️ Workflow Run",
    description: "Dry-run a workflow with mock step execution",
    suggested: JSON.stringify({ workflowId: "dry-run", trigger: "manual", params: { locale: "vi_VN" } }, null, 2),
  },
];

const ACTION_COLORS: Record<string, string> = {
  AI_ROUTING: "#a78bfa",
  CONNECTOR_EXEC: "#60a5fa",
  WORKFLOW_RUN: "#34d399",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SandboxActionExecutorProps {
  /** Tenant UUID — passed through to the fetch helper. */
  tenantId: string;
  /** Active sandbox session ID — all actions execute inside this session. */
  sessionId: string;
}

type ExecStatus = "idle" | "executing" | "done" | "error";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SandboxActionExecutor({ tenantId, sessionId }: SandboxActionExecutorProps) {
  // ── State ──────────────────────────────────────────────────────────

  const [action, setAction] = useState<string>("AI_ROUTING");
  const [inputText, setInputText] = useState<string>(ACTION_OPTIONS[0]?.suggested ?? "");
  const [status, setStatus] = useState<ExecStatus>("idle");
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // ── Action change handler ──────────────────────────────────────────

  const handleActionChange = useCallback((newAction: string) => {
    setAction(newAction);
    const opt = ACTION_OPTIONS.find((a) => a.value === newAction);
    if (opt) setInputText(opt.suggested);
  }, []);

  // ── Input validation ───────────────────────────────────────────────

  const validateInput = useCallback((): unknown | null => {
    const trimmed = inputText.trim();
    if (!trimmed) {
      setParseError("Input payload cannot be empty");
      return null;
    }
    try {
      const parsed = JSON.parse(trimmed);
      setParseError(null);
      return parsed;
    } catch (e) {
      setParseError(e instanceof Error ? `Invalid JSON: ${e.message}` : "Invalid JSON");
      return null;
    }
  }, [inputText]);

  // ── Execute handler ────────────────────────────────────────────────

  const handleExecute = useCallback(async () => {
    const parsed = validateInput();
    if (!parsed) return;

    setStatus("executing");
    setError(null);
    setResult(null);

    try {
      const res = await executeSandboxAction(tenantId, sessionId, action, parsed);
      if (!res) {
        setStatus("error");
        setError("Execute request failed — check network or auth");
        return;
      }
      setResult(res);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Unexpected execution error");
    }
  }, [tenantId, sessionId, action, validateInput]);

  // ── Reset handler ──────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
    setParseError(null);
  }, []);

  // ── Action colour ──────────────────────────────────────────────────

  const accentColor = ACTION_COLORS[action] ?? "#6d7cff";

  // ── Render: no session selected ────────────────────────────────────

  if (!sessionId) {
    return (
      <section style={sectionCard}>
        <div style={{ textAlign: "center", padding: "32px 16px" }}>
          <p style={{ color: "#5a6488", fontSize: 14 }}>
            Select a sandbox session to execute actions.
          </p>
        </div>
      </section>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <section style={sectionCard}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={headerRow}>
        <h2 style={title}>⚡ Execute Action</h2>
        {status !== "idle" && (
          <button onClick={handleReset} style={resetBtn}>
            ⟲ Reset
          </button>
        )}
      </div>
      <p style={{ color: "#8899cc", fontSize: 13, margin: "0 0 20px" }}>
        Execute a sandboxed action in{" "}
        <code style={codeStyle}>{sessionId.slice(0, 8)}…</code>
        . Results are isolated — no production impact.
      </p>

      {/* ── Action type selector ────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Action Type</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ACTION_OPTIONS.map((opt) => {
            const selected = action === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleActionChange(opt.value)}
                disabled={status === "executing"}
                style={{
                  ...actionBtn,
                  background: selected ? `${accentColor}22` : "rgba(255,255,255,0.03)",
                  border: selected
                    ? `1px solid ${accentColor}66`
                    : "1px solid rgba(255,255,255,0.06)",
                  color: selected ? accentColor : "#8899cc",
                  cursor: status === "executing" ? "not-allowed" : "pointer",
                }}
                title={opt.description}
              >
                <span style={{ fontSize: 13, fontWeight: selected ? 700 : 500 }}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Input JSON editor ───────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Input Payload (JSON)</label>
        <textarea
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setParseError(null);
          }}
          disabled={status === "executing"}
          rows={8}
          style={jsonEditor}
          placeholder='{"key": "value"}'
          spellCheck={false}
        />
        {parseError && (
          <p style={{ color: "#f87171", fontSize: 12, marginTop: 4 }}>{parseError}</p>
        )}
      </div>

      {/* ── Execute button ──────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={handleExecute}
          disabled={status === "executing" || !!parseError}
          style={{
            ...executeBtn,
            background:
              status === "executing"
                ? "rgba(109,124,255,0.4)"
                : "linear-gradient(135deg, #6d7cff, #818cf8)",
            cursor: status === "executing" || parseError ? "not-allowed" : "pointer",
            opacity: status === "executing" || parseError ? 0.6 : 1,
          }}
        >
          {status === "executing" ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Spinner />
              Executing…
            </span>
          ) : (
            `▶ Execute ${action.replace(/_/g, " ")}`
          )}
        </button>

        {status === "done" && result && (
          <span style={{ color: "#34d399", fontSize: 13, fontWeight: 600 }}>
            ✅ Done
          </span>
        )}
        {status === "error" && (
          <span style={{ color: "#f87171", fontSize: 13, fontWeight: 600 }}>
            ❌ Failed
          </span>
        )}
      </div>

      {/* ── Error display ───────────────────────────────────────── */}
      {status === "error" && error && (
        <div style={errorBox}>
          <p style={{ fontWeight: 600, margin: "0 0 4px" }}>Execution Error</p>
          <p style={{ margin: 0, fontSize: 13 }}>{error}</p>
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────── */}
      {status === "done" && result && (
        <ResultPanel result={result} accentColor={accentColor} />
      )}

      {/* ── Description footer ──────────────────────────────────── */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <p style={{ color: "#5a6488", fontSize: 11, margin: 0 }}>
          All actions are sandboxed — no real connectors, AI calls, or workflow state is affected.
          Virtual costs are simulated for development estimation.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

/* ── Result Panel ─────────────────────────────────────────────────────── */

function ResultPanel({
  result,
  accentColor,
}: {
  result: ExecuteResult;
  accentColor: string;
}) {
  const trace = result.trace;

  return (
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          padding: 16,
          borderRadius: 14,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#c8d2ff", margin: "0 0 12px" }}>
          📊 Execution Result
        </h3>

        {/* ── Key metrics row ──────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <MetricCard
            label="Status"
            value={trace.isSuccess ? "✅ Success" : "❌ Failed"}
            color={trace.isSuccess ? "#34d399" : "#f87171"}
          />
          <MetricCard
            label="Latency"
            value={formatLatency(trace.latencyMs)}
            color="#60a5fa"
          />
          <MetricCard
            label="Virtual Cost"
            value={formatSimulatedCredits(trace.virtualCostBigInt)}
            color="#fbbf24"
          />
          <MetricCard
            label="Action"
            value={trace.actionType}
            color={accentColor}
          />
        </div>

        {/* ── Payload sections ──────────────────────────────────────── */}
        <PayloadBlock label="Input Payload" payload={trace.inputPayload} />
        {trace.outputPayload && (
          <PayloadBlock label="Output Payload" payload={trace.outputPayload} />
        )}
      </div>
    </div>
  );
}

/* ── Metric Card ──────────────────────────────────────────────────────── */

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${color}22`,
      }}
    >
      <p style={{ fontSize: 11, color: "#5a6488", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </p>
      <p style={{ fontSize: 15, fontWeight: 700, color, margin: 0, fontFamily: "monospace" }}>
        {value}
      </p>
    </div>
  );
}

/* ── Payload Block ────────────────────────────────────────────────────── */

function PayloadBlock({
  label,
  payload,
}: {
  label: string;
  payload: Record<string, any>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          color: "#8899cc",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          padding: "4px 0",
        }}
      >
        <span style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
          ▸
        </span>
        {label}
      </button>
      {expanded && (
        <pre
          style={{
            overflow: "auto",
            borderRadius: 8,
            background: "#0f1424",
            padding: 12,
            fontSize: 12,
            lineHeight: 1.5,
            color: "#c8d2ff",
            border: "1px solid rgba(255,255,255,0.04)",
            maxHeight: 240,
            fontFamily: "monospace",
            margin: 0,
          }}
        >
          <code>{JSON.stringify(payload, null, 2)}</code>
        </pre>
      )}
    </div>
  );
}

/* ── Spinner ──────────────────────────────────────────────────────────── */

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        border: "2px solid rgba(255,255,255,0.3)",
        borderTopColor: "#fff",
        borderRadius: "50%",
        animation: "sandbox-spin 0.6s linear infinite",
      }}
    />
  );
}

// ============================================================================
// Inline keyframes (for spinner animation)
// ============================================================================

if (typeof document !== "undefined") {
  const styleId = "sandbox-executor-spinner-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes sandbox-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

// ============================================================================
// Inline Style Objects
// ============================================================================

const sectionCard: React.CSSProperties = {
  padding: 24,
  borderRadius: 20,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 4,
};

const title: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  margin: 0,
  color: "#c8d2ff",
};

const resetBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.03)",
  color: "#8899cc",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const codeStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  padding: "2px 6px",
  borderRadius: 4,
  fontSize: 12,
  fontFamily: "monospace",
  color: "#9fb0ff",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#8899cc",
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const actionBtn: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 500,
  transition: "all 0.15s",
};

const jsonEditor: React.CSSProperties = {
  width: "100%",
  padding: 14,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "#0f1424",
  color: "#c8d2ff",
  fontSize: 13,
  fontFamily: "monospace",
  lineHeight: 1.5,
  outline: "none",
  resize: "vertical",
  boxSizing: "border-box",
  tabSize: 2,
};

const executeBtn: React.CSSProperties = {
  padding: "12px 24px",
  borderRadius: 12,
  border: "none",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.15s",
  letterSpacing: 0.3,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "12px 16px",
  borderRadius: 12,
  background: "rgba(248,113,113,0.08)",
  border: "1px solid rgba(248,113,113,0.2)",
  color: "#f87171",
  fontSize: 13,
};
