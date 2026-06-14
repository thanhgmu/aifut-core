"use client";

import { useState, useEffect } from "react";
import { API_BASE, getJson } from "../../lib/runtime-data";

const cardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 18,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};

interface NotificationLog {
  id: string;
  tenantId: string;
  channel: string;
  to: string;
  subject: string | null;
  templateKey: string | null;
  status: string;
  provider: string | null;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
}

interface NotificationTemplate {
  id: string;
  key: string;
  name: string;
  channel: string;
  subjectTemplate: string | null;
  bodyTemplate: string;
  format: string;
  createdAt: string;
}

interface Capabilities {
  capability: string;
  status: string;
  channels: Record<string, { status: string; provider: string }>;
  templateEngine: { status: string; format: string[] };
  deliveryTracking: { status: string; storage?: string };
  roadmap: Array<{ id: string; status: string }>;
}

export function NotificationOverview() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "logs" | "templates">("overview");

  useEffect(() => {
    getJson<Capabilities>("/notifications/capabilities").then((d) => setCaps(d ?? null)).catch(() => {});
    getJson<NotificationLog[]>("/notifications/logs/demo-tenant").then((d) => setLogs(Array.isArray(d) ? d : [])).catch(() => {});
    getJson<NotificationTemplate[]>("/notifications/templates?tenantId=demo-tenant").then((d) => setTemplates(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 18px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
    background: active ? "rgba(159,176,255,0.2)" : "rgba(255,255,255,0.04)",
    color: active ? "#9fb0ff" : "#c8d2ff",
  });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setActiveTab("overview")} style={tabStyle(activeTab === "overview")}>Overview</button>
        <button onClick={() => setActiveTab("logs")} style={tabStyle(activeTab === "logs")}>Logs ({logs.length})</button>
        <button onClick={() => setActiveTab("templates")} style={tabStyle(activeTab === "templates")}>Templates ({templates.length})</button>
      </div>

      {activeTab === "overview" && caps && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div style={cardStyle}>
            <div style={{ color: "#9fb0ff", fontSize: 12 }}>Status</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{caps.status}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#9fb0ff", fontSize: 12 }}>Template Engine</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>{caps.templateEngine.status}</div>
            <div style={{ color: "#c8d2ff", fontSize: 12, marginTop: 4 }}>{caps.templateEngine.format.join(", ")}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#9fb0ff", fontSize: 12 }}>Delivery Tracking</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>{caps.deliveryTracking.status}</div>
            <div style={{ color: "#c8d2ff", fontSize: 12, marginTop: 4 }}>{caps.deliveryTracking.storage}</div>
          </div>
          <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
            <div style={{ color: "#9fb0ff", fontSize: 12, marginBottom: 10 }}>Channels</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(caps.channels).map(([ch, info]) => (
                <span key={ch} style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  background: info.status === "implemented" ? "rgba(0,200,100,0.15)" : "rgba(255,200,0,0.15)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: info.status === "implemented" ? "#8fdaa0" : "#f0c060",
                  fontSize: 13,
                }}>
                  {ch} ({info.provider})
                </span>
              ))}
            </div>
          </div>
          <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
            <div style={{ color: "#9fb0ff", fontSize: 12, marginBottom: 8 }}>Roadmap</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {caps.roadmap.map((item) => (
                <span key={item.id} style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  background: item.status === "done" ? "rgba(0,200,100,0.12)" : "rgba(255,255,255,0.04)",
                  color: item.status === "done" ? "#8fdaa0" : "#c8d2ff",
                }}>
                  {item.id} {item.status === "done" ? "✓" : "○"}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "logs" && (
        <div style={{ display: "grid", gap: 8 }}>
          {logs.length === 0 ? (
            <div style={{ color: "#c8d2ff", textAlign: "center", padding: 30 }}>No delivery logs yet. Send a notification to see logs here.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong>{log.channel}</strong>
                  <span style={{
                    color: log.status === "SENT" ? "#8fdaa0" : log.status === "FAILED" ? "#f07070" : "#f0c060",
                    fontSize: 12,
                  }}>{log.status}</span>
                </div>
                <div style={{ marginTop: 6, color: "#c8d2ff", fontSize: 13 }}>
                  To: {log.to}{log.subject ? ` | Subject: ${log.subject}` : ""}
                </div>
                {log.templateKey && <div style={{ color: "#9fb0ff", fontSize: 12, marginTop: 4 }}>Template: {log.templateKey}</div>}
                <div style={{ color: "#9fb0ff", fontSize: 12, marginTop: 4 }}>
                  {log.provider && `Provider: ${log.provider}`}{log.durationMs != null ? ` | ${log.durationMs}ms` : ""}
                </div>
                {log.error && <div style={{ color: "#f07070", fontSize: 12, marginTop: 4 }}>Error: {log.error}</div>}
                <div style={{ color: "#9fb0ff", fontSize: 11, marginTop: 4 }}>{new Date(log.createdAt).toLocaleString()}</div>
              </div>
            ))
          )}
          <a
            href={`${API_BASE}/notifications/logs/demo-tenant`}
            style={{ color: "#9fb0ff", fontSize: 13, textAlign: "center", marginTop: 8 }}
          >
            View full logs API →
          </a>
        </div>
      )}

      {activeTab === "templates" && (
        <div style={{ display: "grid", gap: 8 }}>
          {templates.length === 0 ? (
            <div style={{ color: "#c8d2ff", textAlign: "center", padding: 30 }}>
              No notification templates yet. Create one via POST /notifications/templates.
            </div>
          ) : (
            templates.map((tpl) => (
              <div key={tpl.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong>{tpl.name}</strong>
                  <span style={{ color: "#9fb0ff", fontSize: 12 }}>{tpl.channel} / {tpl.format}</span>
                </div>
                <div style={{ color: "#c8d2ff", fontSize: 13, marginTop: 4 }}>Key: {tpl.key}</div>
                {tpl.subjectTemplate && <div style={{ color: "#9fb0ff", fontSize: 12, marginTop: 4 }}>Subject: {tpl.subjectTemplate}</div>}
              </div>
            ))
          )}
          <a
            href={`${API_BASE}/notifications/templates?tenantId=demo-tenant`}
            style={{ color: "#9fb0ff", fontSize: 13, textAlign: "center", marginTop: 8 }}
          >
            View templates API →
          </a>
        </div>
      )}
    </div>
  );
}

export function NotificationQuickSend() {
  const [channel, setChannel] = useState("email");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/notifications/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: "demo-tenant",
          channel,
          to: to.split(",").map((s) => s.trim()),
          subject,
          body,
        }),
      });
      const data = await res.json();
      setResult(data.success ? "Sent! Message: " + data.messageId : "Failed: " + (data.error || "unknown"));
    } catch (err: any) {
      setResult("Error: " + err.message);
    }
    setSending(false);
  };

  return (
    <div style={cardStyle}>
      <div style={{ color: "#9fb0ff", fontSize: 12, fontWeight: 800, marginBottom: 12 }}>Quick Send</div>
      <div style={{ display: "grid", gap: 10 }}>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} style={inputStyle}>
          <option value="email">Email</option>
          <option value="webhook">Webhook</option>
          <option value="log">Log</option>
          <option value="zalo">Zalo OA</option>
          <option value="sms">SMS</option>
        </select>
        <input placeholder="To (email or comma-separated)" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        <input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} />
        <textarea placeholder="Body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
        <button onClick={handleSend} disabled={sending} style={{
          padding: "10px 20px",
          borderRadius: 10,
          border: "none",
          background: sending ? "#555" : "#4a6cf7",
          color: "white",
          fontWeight: 700,
          cursor: sending ? "not-allowed" : "pointer",
        }}>
          {sending ? "Sending..." : "Send"}
        </button>
        {result && <div style={{ color: "#c8d2ff", fontSize: 13 }}>{result}</div>}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "#f5f7ff",
  fontSize: 14,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
