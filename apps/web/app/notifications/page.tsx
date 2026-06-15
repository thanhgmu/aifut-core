"use client";

import { useEffect, useState } from "react";
import { API_BASE, getStoredToken } from "../../lib/auth";

type LogEntry = {
  id: string; channel: string; to: string; subject: string | null;
  status: string; templateKey: string | null; createdAt: string;
  error: string | null;
};

type Capabilities = {
  channels: Record<string, { status: string; provider: string }>;
  templateEngine: { status: string };
  deliveryTracking: { status: string };
};

const CHANNEL_ICONS: Record<string, string> = {
  EMAIL: "✉️", WEBHOOK: "🔗", SMS: "📱", ZALO: "💬", SLACK: "🔔", LOG: "📝",
};

const CHANNEL_COLORS: Record<string, string> = {
  EMAIL: "#66c4ff", WEBHOOK: "#9fb0ff", SMS: "#4ade80",
  ZALO: "#22d3ee", SLACK: "#facc15", LOG: "#8899cc",
};

export default function NotificationsPage() {
  const token = getStoredToken();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [sendForm, setSendForm] = useState({ channel: "EMAIL", to: "", subject: "", body: "" });

  useEffect(() => {
    const load = async () => {
      const [capsRes] = await Promise.all([
        fetch(`${API_BASE}/notifications/capabilities`).then(r => r.json()).catch(() => null),
      ]);
      setCaps(capsRes);
      const token2 = getStoredToken();

      // Try to get tenant ID from auth me
      if (token2) {
        const me = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token2}` } }).then(r => r.json()).catch(() => null);
        if (me?.tenant?.id) {
          setTenantId(me.tenant.id);
          const logRes = await fetch(`${API_BASE}/notifications/logs/${me.tenant.id}`, {
            headers: { Authorization: `Bearer ${token2}` },
          }).then(r => r.json()).catch(() => []);
          setLogs(Array.isArray(logRes) ? logRes : []);
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSend = async () => {
    if (!token || !tenantId || !sendForm.to) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/notifications/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tenantId,
          channel: sendForm.channel,
          to: sendForm.to,
          subject: sendForm.subject || undefined,
          body: sendForm.body || undefined,
        }),
      });
      if (res.ok) {
        // Refresh logs
        const logRes = await fetch(`${API_BASE}/notifications/logs/${tenantId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()).catch(() => []);
        setLogs(Array.isArray(logRes) ? logRes : []);
        setSendForm({ channel: "EMAIL", to: "", subject: "", body: "" });
      }
    } catch {}
    setSending(false);
  };

  const capsEntries = caps ? Object.entries(caps.channels) : [];

  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif" }}>
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "24px 32px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Communications</div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Notifications</h1>
          <p style={{ color: "#c8d2ff", fontSize: 14, marginTop: 4 }}>Send and track notifications across 6 channels</p>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 32 }}>
        {/* Channel badges */}
        {capsEntries.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
            {capsEntries.map(([channel, info]) => (
              <span key={channel} style={{
                padding: "4px 12px", borderRadius: 999, fontSize: 12,
                background: `${CHANNEL_COLORS[channel] || "#6d7cff"}15`,
                color: CHANNEL_COLORS[channel] || "#6d7cff",
                border: `1px solid ${CHANNEL_COLORS[channel] || "#6d7cff"}30`,
              }}>
                {CHANNEL_ICONS[channel] || "📨"} {channel} · {info.status} · {info.provider}
              </span>
            ))}
          </div>
        )}

        {/* Send form */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 24, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 16px", color: "#c8d2ff" }}>✉️ Send Notification</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <select value={sendForm.channel} onChange={(e) => setSendForm(f => ({ ...f, channel: e.target.value }))} style={{
                flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.05)", color: "#f5f7ff", fontSize: 14,
              }}>
                {capsEntries.map(([c]) => <option key={c} value={c}>{CHANNEL_ICONS[c] || ""} {c}</option>)}
              </select>
              <input value={sendForm.to} onChange={(e) => setSendForm(f => ({ ...f, to: e.target.value }))}
                placeholder="Recipient (email/phone/URL)" style={{ flex: 3, padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#f5f7ff", fontSize: 14 }} />
            </div>
            <input value={sendForm.subject} onChange={(e) => setSendForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Subject (optional)" style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#f5f7ff", fontSize: 14 }} />
            <textarea value={sendForm.body} onChange={(e) => setSendForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Message body (optional, uses template if empty)" rows={3} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#f5f7ff", fontSize: 14, resize: "vertical" }} />
            <button onClick={handleSend} disabled={sending || !sendForm.to} style={{
              padding: "12px 0", borderRadius: 8, border: "none", background: "#6d7cff", color: "white", fontWeight: 700, cursor: sending ? "wait" : "pointer", fontSize: 14,
              opacity: (!sendForm.to || sending) ? 0.6 : 1,
            }}>
              {sending ? "Sending..." : "Send Notification"}
            </button>
          </div>
        </div>

        {/* Logs */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 style={{ fontSize: 16, margin: "0 0 16px", color: "#c8d2ff" }}>📋 Recent Notifications</h2>
          {loading ? (
            <div style={{ color: "#8899cc", fontSize: 13 }}>Loading...</div>
          ) : logs.length === 0 ? (
            <div style={{ color: "#8899cc", fontSize: 13 }}>No notifications sent yet. Send one above!</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {logs.map((log) => (
                <div key={log.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 16px", borderRadius: 8, background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{CHANNEL_ICONS[log.channel] || "📨"}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{log.to}</div>
                      <div style={{ fontSize: 12, color: "#8899cc" }}>{log.subject || log.templateKey || "No subject"}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      fontSize: 12, fontWeight: 600,
                      color: log.status === "SENT" ? "#4ade80" : log.status === "FAILED" ? "#f87171" : "#facc15",
                    }}>
                      {log.status === "SENT" ? "✅ Sent" : log.status === "FAILED" ? "❌ Failed" : "⏳ Pending"}
                    </div>
                    <div style={{ fontSize: 11, color: "#8899cc", marginTop: 2 }}>
                      {new Date(log.createdAt).toLocaleString("vi-VN")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
