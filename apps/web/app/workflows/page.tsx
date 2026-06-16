"use client";

import { useEffect, useState } from "react";
import { API_BASE, getStoredToken } from "../../lib/auth";

type WorkflowTemplate = {
  id: string; key: string; name: string; description: string | null;
  category: string | null; industry: string | null;
  status: string; version: number; tags: string[];
  createdAt: string; updatedAt: string;
};

type WorkflowExecution = {
  id: string; workflowId: string; status: string;
  triggerKind: string | null; createdAt: string;
  completedAt: string | null; error: string | null;
};

type WorkflowStats = {
  total: number; active: number; draft: number;
  executions: number; failed: number; running: number;
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#4ade80", DRAFT: "#9fb0ff", PAUSED: "#facc15",
  DISABLED: "#f87171", ARCHIVED: "#8899cc",
};

export default function WorkflowsPage() {
  const token = getStoredToken();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [execs, setExecs] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!token) { setLoading(false); return; }
      const [tplRes, execRes] = await Promise.all([
        fetch(`${API_BASE}/workflows/templates`).then(r => r.json()).catch(() => []),
        fetch(`${API_BASE}/workflows/executions`).then(r => r.json()).catch(() => []),
      ]);
      setTemplates(Array.isArray(tplRes) ? tplRes : []);
      setExecs(Array.isArray(execRes) ? execRes : []);
      setLoading(false);
    };
    load();
  }, [token]);

  const filtered = filter ? templates.filter(t => t.status === filter) : templates;

  const stats: WorkflowStats = {
    total: templates.length,
    active: templates.filter(t => t.status === "ACTIVE").length,
    draft: templates.filter(t => t.status === "DRAFT").length,
    executions: execs.length,
    failed: execs.filter(e => e.status === "FAILED").length,
    running: execs.filter(e => e.status === "RUNNING").length,
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif" }}>
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "24px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Automation</div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Workflows</h1>
          <p style={{ color: "#c8d2ff", fontSize: 14, marginTop: 4 }}>Manage workflow templates and monitor executions</p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 32 }}>
        {/* Stats */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <StatCard label="Total" value={stats.total} color="#f5f7ff" />
          <StatCard label="Active" value={stats.active} color="#4ade80" />
          <StatCard label="Draft" value={stats.draft} color="#9fb0ff" />
          <StatCard label="Executions" value={stats.executions} color="#66c4ff" />
          <StatCard label="Running" value={stats.running} color="#facc15" />
          <StatCard label="Failed" value={stats.failed} color="#f87171" />
        </div>

        {/* Workflow Templates */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, margin: 0, color: "#c8d2ff" }}>📋 Workflow Templates</h2>
            <div style={{ display: "flex", gap: 8 }}>
              {["", "ACTIVE", "DRAFT", "PAUSED"].map(s => (
                <button key={s} onClick={() => setFilter(s)} style={{
                  padding: "6px 12px", borderRadius: 6, border: "1px solid", cursor: "pointer", fontSize: 12,
                  background: filter === s ? "#6d7cff" : "transparent",
                  color: filter === s ? "white" : "#9fb0ff",
                  borderColor: filter === s ? "#6d7cff" : "rgba(255,255,255,0.15)",
                }}>{s || "All"}</button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ color: "#8899cc" }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: "#8899cc", fontSize: 13, textAlign: "center", padding: 32 }}>
              No workflows found. <a href="/templates" style={{ color: "#6d7cff" }}>Browse templates</a> to install one.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((tpl) => (
                <div key={tpl.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 16px", borderRadius: 8, background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{tpl.name}</div>
                    <div style={{ fontSize: 12, color: "#8899cc" }}>
                      {tpl.description || tpl.key} · v{tpl.version}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {tpl.tags.map(tag => (
                        <span key={tag} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "#8899cc" }}>{tag}</span>
                      ))}
                      {tpl.industry && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "#8899cc" }}>{tpl.industry}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLORS[tpl.status] || "#8899cc" }}>
                      {tpl.status}
                    </div>
                    <div style={{ fontSize: 11, color: "#8899cc", marginTop: 2 }}>
                      Updated {new Date(tpl.updatedAt).toLocaleDateString("vi-VN")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Executions */}
        {execs.length > 0 && (
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 24, border: "1px solid rgba(255,255,255,0.06)", marginTop: 24 }}>
            <h2 style={{ fontSize: 16, margin: "0 0 16px", color: "#c8d2ff" }}>⚡ Recent Executions</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {execs.slice(0, 15).map((exec) => (
                <div key={exec.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 14px", borderRadius: 6, background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.04)", fontSize: 13,
                }}>
                  <span>{exec.triggerKind || "manual"}</span>
                  <span style={{ color: exec.status === "COMPLETED" ? "#4ade80" : exec.status === "FAILED" ? "#f87171" : "#facc15" }}>
                    {exec.status}
                  </span>
                  <span style={{ color: "#8899cc", fontSize: 12 }}>
                    {new Date(exec.createdAt).toLocaleString("vi-VN")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 100, padding: "14px 16px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#9fb0ff", marginTop: 2 }}>{label}</div>
    </div>
  );
}
