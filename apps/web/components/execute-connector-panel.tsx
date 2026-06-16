"use client";

import { useCallback, useState } from "react";
import { API_BASE, getStoredToken } from "../lib/auth";

export type ExecuteConnectorPanelProps = {
  envVars: Record<string, string>;
  onLog: (line: string) => void;
};

type ExecuteState = {
  running: boolean;
  result: ExecuteResult | null;
  error: string | null;
};

type ExecuteResult = {
  actionKey: string;
  actionName: string;
  input: any;
  output: any;
  durationMs: number;
  status: string;
  logs: string[];
};

const DEFAULT_INPUT = JSON.stringify({}, null, 2);

export function ExecuteConnectorPanel({
  envVars,
  onLog,
}: ExecuteConnectorPanelProps) {
  const token = getStoredToken();
  const [actionKey, setActionKey] = useState("");
  const [inputJson, setInputJson] = useState(DEFAULT_INPUT);
  const [state, setState] = useState<ExecuteState>({
    running: false,
    result: null,
    error: null,
  });
  const [execHistory, setExecHistory] = useState<
    { key: string; ts: string; status: string }[]
  >([]);

  const handleExecute = useCallback(async () => {
    if (!token) {
      onLog("ERROR: Not authenticated. Please log in.");
      return;
    }
    if (!actionKey.trim()) {
      onLog("ERROR: No action key provided. Enter an action key to execute.");
      return;
    }

    // Parse input JSON
    let parsedInput: any = {};
    try {
      parsedInput = inputJson.trim()
        ? JSON.parse(inputJson.trim())
        : {};
    } catch {
      onLog("ERROR: Invalid JSON input. Fix the payload and try again.");
      return;
    }

    setState((prev) => ({ ...prev, running: true, error: null, result: null }));
    onLog(`Executing action "${actionKey}"...`);

    const startTs = performance.now();
    try {
      const res = await fetch(
        `${API_BASE}/developer/sandbox/execute/${encodeURIComponent(actionKey.trim())}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            input: parsedInput,
            envVars,
          }),
        },
      );

      const durationMs = Math.round(performance.now() - startTs);
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        const errMsg =
          body?.error || body?.message || `HTTP ${res.status}: ${res.statusText}`;
        throw new Error(errMsg);
      }

      const result: ExecuteResult = {
        actionKey: actionKey.trim(),
        actionName: body.name || actionKey.trim(),
        input: parsedInput,
        output: body.output ?? body,
        durationMs,
        status: "COMPLETED",
        logs: body.logs ?? [],
      };

      setState({ running: false, result, error: null });
      setExecHistory((prev) => [
        { key: actionKey.trim(), ts: new Date().toISOString(), status: "COMPLETED" },
        ...prev.slice(0, 49),
      ]);
      onLog(
        `✅ Action "${result.actionName}" completed in ${durationMs}ms`,
      );
      for (const logLine of result.logs) {
        onLog(`  [action] ${logLine}`);
      }
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - startTs);
      setState({ running: false, result: null, error: err.message });
      setExecHistory((prev) => [
        { key: actionKey.trim(), ts: new Date().toISOString(), status: "FAILED" },
        ...prev.slice(0, 49),
      ]);
      onLog(`❌ Action failed after ${durationMs}ms: ${err.message}`);
    }
  }, [token, actionKey, inputJson, envVars, onLog]);

  const clearResult = useCallback(() => {
    setState({ running: false, result: null, error: null });
  }, []);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Execution Form */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <h3
          style={{
            fontSize: 15,
            margin: "0 0 16px",
            color: "#c8d2ff",
          }}
        >
          ▶️ Execute Connector Action
        </h3>

        {/* Action Key */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#9fb0ff",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            Action Key
          </label>
          <input
            placeholder="e.g. create_contact, send_email"
            value={actionKey}
            onChange={(e) => setActionKey(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.3)",
              color: "#f5f7ff",
              fontSize: 14,
              fontFamily: "monospace",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Input JSON */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#9fb0ff",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            Input Payload (JSON)
          </label>
          <textarea
            placeholder='{ "field": "value" }'
            value={inputJson}
            onChange={(e) => setInputJson(e.target.value)}
            rows={6}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.3)",
              color: "#f5f7ff",
              fontSize: 13,
              fontFamily: "monospace",
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Env Vars Summary */}
        <div
          style={{
            marginBottom: 16,
            padding: "8px 14px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.05)",
            fontSize: 12,
            color: "#8899cc",
          }}
        >
          Environment: {Object.keys(envVars).length} variable(s) will be
          injected
        </div>

        {/* Execute Button */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={handleExecute}
            disabled={state.running || !actionKey.trim()}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              border: "none",
              background: state.running
                ? "rgba(109,124,255,0.3)"
                : "#6d7cff",
              color: "white",
              fontWeight: 700,
              fontSize: 14,
              cursor:
                state.running || !actionKey.trim()
                  ? "not-allowed"
                  : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {state.running ? "⏳ Running..." : "▶️ Execute"}
          </button>
          {state.result && (
            <button
              onClick={clearResult}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "transparent",
                color: "#9fb0ff",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Clear Result
            </button>
          )}
        </div>
      </div>

      {/* Result / Error Display */}
      {state.error && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: 10,
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.2)",
            color: "#f87171",
            fontSize: 13,
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          ⚠️ Execution Error: {state.error}
        </div>
      )}

      {state.result && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: 12,
            background: "rgba(74,222,128,0.03)",
            border: "1px solid rgba(74,222,128,0.15)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: 15,
                  margin: 0,
                  color: "#4ade80",
                }}
              >
                ✅ Result — {state.result.actionName}
              </h3>
              <div
                style={{
                  color: "#8899cc",
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                Action: {state.result.actionKey} ·{" "}
                {state.result.durationMs}ms · Status: {state.result.status}
              </div>
            </div>
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                background: "rgba(74,222,128,0.12)",
                color: "#4ade80",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {state.result.durationMs}ms
            </span>
          </div>

          {/* Input */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 12,
                color: "#9fb0ff",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Input
            </div>
            <pre
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 8,
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "#c8d2ff",
                fontSize: 12,
                fontFamily: "monospace",
                overflowX: "auto",
                lineHeight: 1.5,
              }}
            >
              {JSON.stringify(state.result.input, null, 2)}
            </pre>
          </div>

          {/* Output */}
          <div>
            <div
              style={{
                fontSize: 12,
                color: "#9fb0ff",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Output
            </div>
            <pre
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 8,
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "#c8d2ff",
                fontSize: 12,
                fontFamily: "monospace",
                overflowX: "auto",
                lineHeight: 1.5,
                maxHeight: 400,
                overflowY: "auto",
              }}
            >
              {JSON.stringify(state.result.output, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Execution History */}
      {execHistory.length > 0 && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <h3
            style={{
              fontSize: 14,
              margin: "0 0 12px",
              color: "#c8d2ff",
            }}
          >
            📜 Execution History (last {execHistory.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {execHistory.map((h, i) => (
              <div
                key={`${h.ts}-${i}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.02)",
                  fontSize: 12,
                  fontFamily: "monospace",
                }}
              >
                <span style={{ color: "#66c4ff" }}>{h.key}</span>
                <span
                  style={{
                    color:
                      h.status === "COMPLETED" ? "#4ade80" : "#f87171",
                  }}
                >
                  {h.status}
                </span>
                <span style={{ color: "#8899cc" }}>
                  {new Date(h.ts).toLocaleTimeString("vi-VN")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
