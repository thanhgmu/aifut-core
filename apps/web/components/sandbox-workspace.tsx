"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE, getStoredToken } from "../lib/auth";

export type SandboxWorkspaceProps = {
  envVars: Record<string, string>;
  onLog: (line: string) => void;
};

type AisDiscovery = {
  name: string;
  version: string;
  description: string;
  actions: { key: string; name: string; description: string }[];
  triggers: { key: string; name: string; description: string }[];
};

type WorkspaceState = {
  discovery: AisDiscovery | null;
  loading: boolean;
  error: string | null;
};

export function SandboxWorkspace({ envVars, onLog }: SandboxWorkspaceProps) {
  const token = getStoredToken();
  const [state, setState] = useState<WorkspaceState>({
    discovery: null,
    loading: false,
    error: null,
  });
  const [lastScanned, setLastScanned] = useState<Date | null>(null);

  const scanDiscovery = useCallback(async () => {
    if (!token) {
      setState({ discovery: null, loading: false, error: "Not authenticated" });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(`${API_BASE}/developer/sandbox/discovery`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new Error(`Discovery scan failed (${res.status}): ${text}`);
      }
      const data: AisDiscovery = await res.json();
      setState({ discovery: data, loading: false, error: null });
      setLastScanned(new Date());
      onLog(
        `Workspace scan complete: ${data.name} v${data.version} — ${data.actions.length} actions, ${data.triggers.length} triggers`,
      );
    } catch (err: any) {
      setState({ discovery: null, loading: false, error: err.message });
      onLog(`ERROR: Workspace scan failed — ${err.message}`);
    }
  }, [token, onLog]);

  // Initial scan on mount
  useEffect(() => {
    scanDiscovery();
  }, [scanDiscovery]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Header + Scan button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, margin: 0, color: "#c8d2ff" }}>
            🛠️ Connector Workspace
          </h2>
          <p style={{ color: "#8899cc", fontSize: 13, margin: "4px 0 0" }}>
            Scans the connected AIS connector for available actions and
            triggers.
            {lastScanned && (
              <>
                {" "}Last scanned: {lastScanned.toLocaleString("vi-VN")}
              </>
            )}
          </p>
        </div>
        <button
          onClick={scanDiscovery}
          disabled={state.loading}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            border: "1px solid #6d7cff",
            background: state.loading
              ? "rgba(109,124,255,0.15)"
              : "rgba(109,124,255,0.2)",
            color: "#6d7cff",
            fontWeight: 600,
            fontSize: 13,
            cursor: state.loading ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}
        >
          {state.loading ? "⏳ Scanning..." : "🔄 Rescan"}
        </button>
      </div>

      {/* Error state */}
      {state.error && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.2)",
            color: "#f87171",
            fontSize: 13,
          }}
        >
          ⚠️ {state.error}
        </div>
      )}

      {/* Discovery card */}
      {state.discovery ? (
        <>
          <InfoCard
            title="Connector Info"
            rows={[
              { label: "Name", value: state.discovery.name },
              { label: "Version", value: `v${state.discovery.version}` },
              { label: "Description", value: state.discovery.description },
            ]}
          />

          {/* Actions */}
          <Section title={`Actions (${state.discovery.actions.length})`}>
            {state.discovery.actions.length === 0 ? (
              <EmptyState message="No actions registered." />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {state.discovery.actions.map((act) => (
                  <div
                    key={act.key}
                    style={{
                      padding: "12px 16px",
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        color: "#66c4ff",
                      }}
                    >
                      {act.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#8899cc",
                        fontFamily: "monospace",
                        marginTop: 2,
                      }}
                    >
                      key: {act.key}
                    </div>
                    {act.description && (
                      <div
                        style={{
                          color: "#c8d2ff",
                          fontSize: 13,
                          marginTop: 6,
                          lineHeight: 1.5,
                        }}
                      >
                        {act.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Triggers */}
          <Section title={`Triggers (${state.discovery.triggers.length})`}>
            {state.discovery.triggers.length === 0 ? (
              <EmptyState message="No triggers registered." />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {state.discovery.triggers.map((trg) => (
                  <div
                    key={trg.key}
                    style={{
                      padding: "12px 16px",
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        color: "#facc15",
                      }}
                    >
                      {trg.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#8899cc",
                        fontFamily: "monospace",
                        marginTop: 2,
                      }}
                    >
                      key: {trg.key}
                    </div>
                    {trg.description && (
                      <div
                        style={{
                          color: "#c8d2ff",
                          fontSize: 13,
                          marginTop: 6,
                          lineHeight: 1.5,
                        }}
                      >
                        {trg.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      ) : !state.loading && !state.error ? (
        <EmptyState message="No connector connected. Use the Environment tab to configure connection details and then execute a scan." />
      ) : null}
    </div>
  );
}

// ── Shared Sub-Components ────────────────────────────────────────────────

function InfoCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <div
      style={{
        padding: "16px 20px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <h3 style={{ fontSize: 14, margin: "0 0 12px", color: "#9fb0ff" }}>
        {title}
      </h3>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((row) => (
          <div
            key={row.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              fontSize: 13,
            }}
          >
            <span style={{ color: "#8899cc", minWidth: 120 }}>
              {row.label}
            </span>
            <span
              style={{
                color: "#c8d2ff",
                textAlign: "right",
                fontFamily: row.label === "Key" || row.label === "Version"
                  ? "monospace"
                  : "inherit",
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3
        style={{
          fontSize: 16,
          fontWeight: 700,
          marginBottom: 12,
          color: "#c8d2ff",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 10,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        color: "#8899cc",
        fontSize: 13,
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}
