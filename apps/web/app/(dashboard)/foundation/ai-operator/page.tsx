"use client";

// =====================================================================
// foundation/ai-operator/page.tsx — AI Operator Agent Dashboard
// Phase 3 ecosystem depth: session metrics, cost display, agent health,
// session archiving + export.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../../../../lib/auth";

// ── Types ──────────────────────────────────────────────────────────────

type ChatMessage = { role: "user" | "assistant"; content: string; timestamp: string };

type AgentSession = {
  id: string; title: string; status: string; messageCount: number;
  createdAt: string; updatedAt: string;
};

type AgentIntent = { key: string; label: string; description: string };

type QueryResponse = {
  sessionId: string; intent: string; confidence: number;
  recommendedActions: Array<{ type: string; targetId: string; description: string }>;
  messages: ChatMessage[];
};

type AgentHealth = { status: string; uptime?: string; activeSessions: number; latencyMs?: number };

// ── Config ─────────────────────────────────────────────────────────────

const INTENT_PROMPTS: Record<string, string> = {
  BUDGET_OPTIMIZATION: "Tối ưu ngân sách AI và định tuyến mô hình",
  SYSTEM_HEALTH_CHECK: "Kiểm tra sức khỏe hệ thống và quét lỗi",
  SECURITY_REVIEW: "Rà soát bảo mật và phân quyền tenant",
  INTEGRATION_PLANNING: "Lập kế hoạch tích hợp connector và API",
};

const INTENT_ICONS: Record<string, string> = {
  BUDGET_OPTIMIZATION: "💰", SYSTEM_HEALTH_CHECK: "🔍",
  SECURITY_REVIEW: "🔒", INTEGRATION_PLANNING: "🔌", GENERAL_ASSISTANCE: "🤖",
};

// ── Helpers ────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = typeof window !== "undefined" ? localStorage.getItem("aifut_token") : null;
  if (t) h["Authorization"] = `Bearer ${t}`;
  const ti = typeof window !== "undefined" ? localStorage.getItem("aifut_tenant_id") : null;
  if (ti) h["x-tenant-id"] = ti;
  return h;
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function renderMsg(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

// ── Session Metrics Panel ──────────────────────────────────────────────

function SessionMetricsPanel({ session }: { session: AgentSession | null }) {
  if (!session) return null;
  const created = new Date(session.createdAt);
  const updated = new Date(session.updatedAt);
  const durationMs = updated.getTime() - created.getTime();
  const durationMin = Math.round(durationMs / 60000);

  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", fontSize: 12, color: "#8899cc" }}>
      <p style={{ fontWeight: 600, color: "#c8d2ff", margin: "0 0 8px" }}>📊 Session Metrics</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
        <span>Messages:</span><span style={{ fontWeight: 600, color: "#f5f7ff" }}>{session.messageCount}</span>
        <span>Duration:</span><span style={{ fontWeight: 600, color: "#f5f7ff" }}>{durationMin < 1 ? "<1m" : `${durationMin}m`}</span>
        <span>Created:</span><span style={{ fontWeight: 600, color: "#f5f7ff", fontSize: 11 }}>{timeAgo(session.createdAt)}</span>
        <span>Status:</span>
        <span style={{ fontWeight: 600, color: session.status === "active" ? "#34d399" : "#5a6488" }}>
          {session.status === "active" ? "● Active" : "○ Archived"}
        </span>
      </div>
    </div>
  );
}

// ── Agent Health Badge ─────────────────────────────────────────────────

function AgentHealthBadge({ health, loading }: { health: AgentHealth | null; loading: boolean }) {
  if (loading) return <span style={{ fontSize: 11, color: "#5a6488" }}>Checking...</span>;
  if (!health) return <span style={{ fontSize: 11, color: "#ef4444" }}>● Offline</span>;
  return (
    <span style={{ fontSize: 11, color: "#34d399", display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399" }} />
      Online · {health.activeSessions} sessions
      {health.latencyMs != null && ` · ${health.latencyMs}ms`}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════

export default function AiOperatorPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [currentSession, setCurrentSession] = useState<AgentSession | null>(null);
  const [intents, setIntents] = useState<AgentIntent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);

  const fetchIntents = useCallback(async () => {
    try { const r = await fetch(`${API_BASE}/v1/ai-agent/intents`, { headers: getHeaders() }); if (r.ok) setIntents((await r.json()).intents || []); } catch { }
  }, []);

  const fetchSessions = useCallback(async () => {
    try { const r = await fetch(`${API_BASE}/v1/ai-agent/sessions`, { headers: getHeaders() }); if (r.ok) { const d = await r.json(); setSessions(d.items || []); } } catch { }
  }, []);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const r = await fetch(`${API_BASE}/v1/ai-agent/health`, { headers: getHeaders(), cache: "no-store" });
      if (r.ok) setHealth(await r.json());
    } catch { setHealth(null); }
    setHealthLoading(false);
  }, []);

  useEffect(() => {
    fetchIntents(); fetchSessions(); fetchHealth();
    if (!initialized) {
      setMessages([{
        role: "assistant",
        content: `👋 **Xin chào!** Tôi là AI Operator Agent.\n\nTôi có thể giúp:\n${[
          "💰 **Budget Optimization** — phân tích chi phí, tối ưu AI routing",
          "🔍 **System Health Check** — quét lỗi, kiểm tra logs",
          "🔒 **Security Review** — rà soát phân quyền, audit",
          "🔌 **Integration Planning** — kế hoạch tích hợp connector",
          "🤖 **General Assistance** — tư vấn chung",
        ].map((l) => `• ${l}`).join("\n")}\n\n_Hãy nhập câu hỏi hoặc chọn intent._`,
        timestamp: new Date().toISOString(),
      }]);
      setInitialized(true);
    }
  }, [initialized, fetchIntents, fetchSessions, fetchHealth]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Find current session details ────────────────────────────────────

  useEffect(() => {
    if (sessionId) {
      const found = sessions.find((s) => s.id === sessionId);
      setCurrentSession(found ?? null);
    } else {
      setCurrentSession(null);
    }
  }, [sessionId, sessions]);

  // ── Send query ──────────────────────────────────────────────────────

  const sendQuery = async (query: string, sid?: string | null) => {
    if (!query.trim() || loading) return;
    setLoading(true);
    const userMsg: ChatMessage = { role: "user", content: query, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    try {
      const r = await fetch(`${API_BASE}/v1/ai-agent/query`, {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify({ query, sessionId: sid || undefined }),
      });
      if (r.ok) {
        const data: QueryResponse = await r.json();
        setSessionId(data.sessionId);
        const newMsgs = data.messages.filter((m) => m.role === "assistant");
        setMessages((prev) => [...prev.filter((m) => m.role === "user" || m.timestamp !== newMsgs[0]?.timestamp), ...newMsgs]);
        fetchSessions();
      } else {
        const err = await r.json();
        setMessages((prev) => [...prev, { role: "assistant", content: `❌ **Error:** ${err.message || "Something went wrong"}`, timestamp: new Date().toISOString() }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "❌ **Network error.** Could not connect to AI Agent service.", timestamp: new Date().toISOString() }]);
    } finally { setLoading(false); }
  };

  // ── Load session ────────────────────────────────────────────────────

  const loadSession = async (id: string) => {
    try {
      const r = await fetch(`${API_BASE}/v1/ai-agent/sessions/${id}`, { headers: getHeaders() });
      if (r.ok) {
        const session = await r.json();
        setSessionId(session.id);
        setMessages(session.messages || []);
        setShowSessions(false);
      }
    } catch { }
  };

  // ── Archive session ─────────────────────────────────────────────────

  const archiveSession = async () => {
    if (!sessionId) return;
    try {
      await fetch(`${API_BASE}/v1/ai-agent/sessions/${sessionId}`, { method: "DELETE", headers: getHeaders() });
      setSessionId(null);
      setMessages([{ role: "assistant", content: "🗂️ Session archived. Start a new one!", timestamp: new Date().toISOString() }]);
      fetchSessions();
    } catch { }
  };

  // ── Export session ──────────────────────────────────────────────────

  const exportSession = () => {
    if (messages.length === 0) return;
    const blob = new Blob([JSON.stringify({ sessionId, messages, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `ai-agent-${(sessionId ?? "new").slice(0, 12)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── New session ─────────────────────────────────────────────────────

  const newSession = () => {
    setSessionId(null);
    setMessages([{ role: "assistant", content: "🆕 **New session started.** What do you need?", timestamp: new Date().toISOString() }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuery(input, sessionId); }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-sky-700">Foundation / AI Operator</p>
            <h1 className="mt-0.5 text-xl font-bold tracking-normal text-slate-950">🧠 AI Operator Agent</h1>
          </div>
          <AgentHealthBadge health={health} loading={healthLoading} />
        </div>
        <div className="flex items-center gap-2">
          {sessionId && (
            <span className="text-[10px] text-slate-400 font-mono">{sessionId.slice(0, 10)}…</span>
          )}
          <button type="button" onClick={() => setShowSessions(!showSessions)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            {showSessions ? "✕" : `📋 ${sessions.length}`}
          </button>
          <button type="button" onClick={newSession}
            className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
            + New
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Session Sidebar */}
        {showSessions && (
          <div className="w-72 border-r border-slate-200 bg-white overflow-y-auto shrink-0">
            <div className="p-4">
              <h2 className="text-xs font-semibold uppercase text-slate-500 mb-3">Sessions ({sessions.length})</h2>
              {sessions.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No sessions yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {sessions.map((s) => (
                    <button key={s.id} type="button" onClick={() => loadSession(s.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition ${
                        s.id === sessionId ? "border-sky-200 bg-sky-50 text-sky-700" : "border-slate-100 hover:border-slate-200 text-slate-700"
                      }`}>
                      <p className="text-sm font-medium truncate flex items-center gap-1.5">
                        {s.status === "active" ? "●" : "○"}
                        {s.title}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {s.messageCount} msg · {timeAgo(s.updatedAt)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] rounded-xl px-5 py-3 ${
                  msg.role === "user" ? "bg-sky-600 text-white" : "bg-white border border-slate-200 text-slate-800 shadow-sm"
                }`}>
                  <div className="text-sm leading-6" dangerouslySetInnerHTML={{ __html: renderMsg(msg.content) }} />
                  <p className={`mt-2 text-xs ${msg.role === "user" ? "text-sky-200" : "text-slate-400"}`}>
                    {formatTimestamp(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
                    <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse delay-75" />
                    <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse delay-150" />
                    Thinking...
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Session Metrics + Actions bar (when session active) */}
          {sessionId && currentSession && (
            <div className="border-t border-slate-200 bg-white px-6 py-2 flex items-center gap-4">
              <div className="flex-1 max-w-xs">
                <SessionMetricsPanel session={currentSession} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={exportSession}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50">
                  📥 Export
                </button>
                <button type="button" onClick={archiveSession}
                  className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-500 hover:bg-rose-50">
                  🗂️ Archive
                </button>
              </div>
            </div>
          )}

          {/* Intent Quick Actions */}
          <div className="border-t border-slate-200 bg-white px-6 py-2.5">
            <div className="flex flex-wrap gap-2">
              {intents.filter((i) => i.key !== "GENERAL_ASSISTANCE").map((intent) => (
                <button key={intent.key} type="button" onClick={() => sendQuery(INTENT_PROMPTS[intent.key] || intent.label, sessionId)} disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-50">
                  {INTENT_ICONS[intent.key] || "🤖"} {intent.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-slate-200 bg-white px-6 py-3">
            <div className="flex gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} disabled={loading}
                placeholder="Ask the AI Operator Agent..."
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4 disabled:opacity-60" />
              <button type="button" onClick={() => sendQuery(input, sessionId)} disabled={!input.trim() || loading}
                className="h-11 rounded-xl bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 flex items-center gap-2">
                {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : "Send →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
