"use client";

import { useCallback, useState } from "react";
import { SandboxWorkspace } from "../../../components/sandbox-workspace";
import { SandboxEnvForm } from "../../../components/sandbox-env-form";
import { ExecuteConnectorPanel } from "../../../components/execute-connector-panel";
import { SandboxLogs } from "../../../components/sandbox-logs";

type SandboxTab = "workspace" | "env" | "execute" | "logs";

export default function DeveloperSandboxPage() {
  const [activeTab, setActiveTab] = useState<SandboxTab>("workspace");
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<string[]>([]);

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [...prev, `[${new Date().toISOString()}] ${line}`]);
  }, []);

  const tabs: { id: SandboxTab; label: string; icon: string }[] = [
    { id: "workspace", label: "Workspace", icon: "🛠️" },
    { id: "env", label: "Environment", icon: "🔐" },
    { id: "execute", label: "Execute", icon: "▶️" },
    { id: "logs", label: "Logs", icon: "📋" },
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b1020",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "24px 32px",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div
            style={{
              fontSize: 12,
              color: "#9fb0ff",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 4,
            }}
          >
            Developer Sandbox
          </div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Sandbox</h1>
          <p style={{ color: "#c8d2ff", fontSize: 14, marginTop: 4 }}>
            Build, test, and debug AIS connectors in a sandbox environment
            with live env vars, action execution, and real-time logs.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "0 32px",
          display: "flex",
          gap: 4,
          overflowX: "auto",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "12px 20px",
              borderRadius: 0,
              border: "none",
              borderBottom:
                activeTab === tab.id
                  ? "2px solid #6d7cff"
                  : "2px solid transparent",
              background: "transparent",
              color: activeTab === tab.id ? "#6d7cff" : "#9fb0ff",
              fontWeight: activeTab === tab.id ? 700 : 400,
              cursor: "pointer",
              fontSize: 14,
              whiteSpace: "nowrap",
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px" }}>
        {activeTab === "workspace" && (
          <SandboxWorkspace envVars={envVars} onLog={appendLog} />
        )}
        {activeTab === "env" && (
          <SandboxEnvForm
            envVars={envVars}
            onChange={setEnvVars}
            onLog={appendLog}
          />
        )}
        {activeTab === "execute" && (
          <ExecuteConnectorPanel envVars={envVars} onLog={appendLog} />
        )}
        {activeTab === "logs" && (
          <SandboxLogs
            logs={logs}
            onClear={() => setLogs([])}
            onLog={appendLog}
          />
        )}
      </div>

      {/* Footer */}
      <footer
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "24px 32px 48px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          color: "#9fb0ff",
          fontSize: 13,
        }}
      >
        <div>© 2026 AIFUT — Developer Sandbox</div>
        <div style={{ display: "flex", gap: 16 }}>
          <a
            href="/developer"
            style={{ color: "#9fb0ff", textDecoration: "none" }}
          >
            Developer Portal
          </a>
          <a
            href="/foundation"
            style={{ color: "#9fb0ff", textDecoration: "none" }}
          >
            Foundation
          </a>
        </div>
      </footer>
    </main>
  );
}
