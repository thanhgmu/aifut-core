"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../../../../lib/auth";

// ── Types ────────────────────────────────────────────────────────────────

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type AgentSession = {
  id: string;
  title: string;
  status: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

type AgentIntent = {
  key: string;
  label: string;
  description: string;
};

type QueryResponse = {
  sessionId: string;
  intent: string;
  confidence: number;
  recommendedActions: Array<{ type: string; targetId: string; description: string }>;
  messages: ChatMessage[];
};

// ── Intent Quick Action Config ────────────────────────────────────────────

const INTENT_PROMPTS: Record<string, string> = {
  BUDGET_OPTIMIZATION: "Tối ưu ngân sách AI và định tuyến mô hình",
  SYSTEM_HEALTH_CHECK: "Kiểm tra sức khỏe hệ thống và quét lỗi",
  SECURITY_REVIEW: "Rà soát bảo mật và phân quyền tenant",
  INTEGRATION_PLANNING: "Lập kế hoạch tích hợp connector và API",
};

const INTENT_ICONS: Record<string, string> = {
  BUDGET_OPTIMIZATION: "💰",
  SYSTEM_HEALTH_CHECK: "🔍",
  SECURITY_REVIEW: "🔒",
  INTEGRATION_PLANNING: "🔌",
  GENERAL_ASSISTANCE: "🤖",
};

// ── Helpers ──────────────────────────────────────────────────────────────

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

function renderMessageContent(content: string): string {
  // Basic markdown-style rendering
  return content
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function AiOperatorPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [intents, setIntents] = useState<AgentIntent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Welcome message
  const [initialized, setInitialized] = useState(false);

  const fetchIntents = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/ai-agent/intents`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setIntents(data.intents || []);
      }
    } catch { /* silent */ }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/ai-agent/sessions`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.items || []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchIntents();
    fetchSessions();
    if (!initialized) {
      setMessages([{
        role: "assistant",
        content: `👋 **Xin chào!** Tôi là AI Operator Agent của bạn.\n\nTôi có thể giúp:\n${[
          "💰 **Budget Optimization** — phân tích chi phí, tối ưu AI routing",
          "🔍 **System Health Check** — quét lỗi, kiểm tra logs",
          "🔒 **Security Review** — rà soát phân quyền, audit",
          "🔌 **Integration Planning** — kế hoạch tích hợp connector",
          "🤖 **General Assistance** — tư vấn chung",
        ].map((l) => `• ${l}`).join("\n")}\n\n_Hãy nhập câu hỏi hoặc chọn một intent bên dưới._`,
        timestamp: new Date().toISOString(),
      }]);
      setInitialized(true);
    }
  }, [initialized, fetchIntents, fetchSessions]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendQuery = async (query: string, sid?: string | null) => {
    if (!query.trim() || loading) return;
    setLoading(true);

    const userMsg: ChatMessage = {
      role: "user",
      content: query,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const res = await fetch(`${API_BASE}/v1/ai-agent/query`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ query, sessionId: sid || undefined }),
      });

      if (res.ok) {
        const data: QueryResponse = await res.json();
        setSessionId(data.sessionId);

        const newMessages = data.messages.filter((m) => m.role === "assistant");
        setMessages((prev) => {
          const existing = prev.filter((m) => m.role === "user" || m.timestamp !== newMessages[0]?.timestamp);
          return [...existing, ...newMessages];
        });

        fetchSessions();
      } else {
        const err = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `❌ **Error:** ${err.message || "Something went wrong"}`, timestamp: new Date().toISOString() },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "❌ **Network error.** Không thể kết nối tới AI Agent service.", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadSession = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/v1/ai-agent/sessions/${id}`, { headers: getHeaders() });
      if (res.ok) {
        const session = await res.json();
        setSessionId(session.id);
        setMessages(session.messages || []);
        setShowSessions(false);
      }
    } catch { /* silent */ }
  };

  const newSession = () => {
    setSessionId(null);
    setMessages([{
      role: "assistant",
      content: "🆕 **New session started.** Hãy cho tôi biết bạn cần gì?",
      timestamp: new Date().toISOString(),
    }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuery(input, sessionId);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-sky-700">Foundation / AI Operator</p>
          <h1 className="mt-1 text-xl font-bold tracking-normal text-slate-950">🧠 AI Operator Agent</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSessions(!showSessions)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {showSessions ? "✕ Close" : `📋 ${sessions.length} Sessions`}
          </button>
          <button
            type="button"
            onClick={newSession}
            className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            + New Session
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Session Sidebar */}
        {showSessions && (
          <div className="w-72 border-r border-slate-200 bg-white overflow-y-auto shrink-0">
            <div className="p-4">
              <h2 className="text-xs font-semibold uppercase text-slate-500 mb-3">Sessions</h2>
              {sessions.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No sessions yet.</p>
              ) : (
                <div className="space-y-2">
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => loadSession(s.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition ${
                        s.id === sessionId
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                          : "border-slate-100 hover:border-slate-200 text-slate-700"
                      }`}
                    >
                      <p className="text-sm font-medium truncate">{s.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {s.messageCount} msg · {new Date(s.updatedAt).toLocaleDateString("vi-VN")}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[70%] rounded-xl px-5 py-3 ${
                    msg.role === "user"
                      ? "bg-sky-600 text-white"
                      : "bg-white border border-slate-200 text-slate-800 shadow-sm"
                  }`}
                >
                  <div
                    className="text-sm leading-6"
                    dangerouslySetInnerHTML={{ __html: renderMessageContent(msg.content) }}
                  />
                  <p className={`mt-2 text-xs ${msg.role === "user" ? "text-sky-200" : "text-slate-400"}`}>
                    {formatTimestamp(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
                    <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse delay-75" />
                    <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse delay-150" />
                    Agent thinking...
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Intent Quick Actions */}
          <div className="border-t border-slate-200 bg-white px-6 py-3">
            <div className="flex flex-wrap gap-2">
              {intents.filter((i) => i.key !== "GENERAL_ASSISTANCE").map((intent) => (
                <button
                  key={intent.key}
                  type="button"
                  onClick={() => sendQuery(INTENT_PROMPTS[intent.key] || intent.label, sessionId)}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-50"
                >
                  {INTENT_ICONS[intent.key] || "🤖"} {intent.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-slate-200 bg-white px-6 py-4">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                placeholder="Nhập câu hỏi cho AI Operator Agent..."
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => sendQuery(input, sessionId)}
                disabled={!input.trim() || loading}
                className="h-11 rounded-xl bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 flex items-center gap-2"
              >
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  "Send →"
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {sessionId ? `Session: ${sessionId.slice(0, 16)}...` : "New session sẽ tự động tạo."}
              <span className="ml-2">Enter để gửi, Shift+Enter để xuống dòng.</span>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
