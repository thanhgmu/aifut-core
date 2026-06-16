"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SandboxLogsProps = {
  logs: string[];
  onClear: () => void;
  onLog: (line: string) => void;
};

type LogFilter = "all" | "info" | "warn" | "error" | "action";

const LOG_LEVEL_ICONS: Record<string, string> = {
  "INFO": "ℹ️",
  "WARN": "⚠️",
  "ERROR": "❌",
  "DEBUG": "🔍",
  "ACTION": "▶️",
};

function detectLogLevel(line: string): string {
  const upper = line.toUpperCase();
  if (upper.includes("ERROR") || upper.includes("FAILED") || upper.includes("EXCEPTION") || upper.includes("⚠️")) return "ERROR";
  if (upper.includes("WARN") || upper.includes("WARNING") || upper.includes("⚠️")) return "WARN";
  if (upper.includes("DEBUG") || upper.includes("🔍")) return "DEBUG";
  if (upper.includes("ACTION") || upper.includes("▶️") || upper.includes("EXECUT")) return "ACTION";
  return "INFO";
}

function getLogColor(level: string): string {
  switch (level) {
    case "ERROR": return "#f87171";
    case "WARN": return "#facc15";
    case "ACTION": return "#66c4ff";
    case "DEBUG": return "#9fb0ff";
    default: return "#c8d2ff";
  }
}

export function SandboxLogs({ logs, onClear, onLog }: SandboxLogsProps) {
  const [filter, setFilter] = useState<LogFilter>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(logs.length);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (!autoScroll || logs.length <= prevLengthRef.current) return;
    prevLengthRef.current = logs.length;
    const el = scrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [logs.length, autoScroll]);

  // Scroll handler to disable auto-scroll when user scrolls up
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(isAtBottom);
  }, []);

  // Filter logs
  const filteredLogs = logs.filter((line) => {
    const level = detectLogLevel(line);
    if (filter === "error" && level !== "ERROR") return false;
    if (filter === "warn" && level !== "WARN") return false;
    if (filter === "info" && level !== "INFO") return false;
    if (filter === "action" && level !== "ACTION") return false;
    if (searchTerm.trim() && !line.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Export logs
  const handleExport = useCallback(() => {
    const text = logs.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sandbox-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onLog("Logs exported to file.");
  }, [logs, onLog]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Toolbar */}
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
          <h2
            style={{
              fontSize: 18,
              margin: 0,
              color: "#c8d2ff",
            }}
          >
            📋 Connector Logs
          </h2>
          <p
            style={{
              color: "#8899cc",
              fontSize: 13,
              margin: "4px 0 0",
            }}
          >
            {logs.length} total log lines ·{" "}
            {filteredLogs.length} shown
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          {(["all", "info", "warn", "error", "action"] as LogFilter[]).map(
            (f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  border: "1px solid",
                  background:
                    filter === f
                      ? "rgba(109,124,255,0.15)"
                      : "transparent",
                  color: filter === f ? "#6d7cff" : "#9fb0ff",
                  borderColor:
                    filter === f ? "#6d7cff" : "rgba(255,255,255,0.12)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                {f === "all" ? "All" : f}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Search bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          placeholder="🔍 Search logs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: "1 1 200px",
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.3)",
            color: "#f5f7ff",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          onClick={handleExport}
          disabled={logs.length === 0}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "transparent",
            color: logs.length === 0 ? "#555" : "#9fb0ff",
            fontSize: 12,
            fontWeight: 600,
            cursor: logs.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          💾 Export
        </button>
        <button
          onClick={onClear}
          disabled={logs.length === 0}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid rgba(248,113,113,0.3)",
            background: "transparent",
            color: logs.length === 0 ? "#555" : "#f87171",
            fontSize: 12,
            fontWeight: 600,
            cursor: logs.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          🗑️ Clear
        </button>
        <button
          onClick={() => {
            setAutoScroll(true);
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: `1px solid ${autoScroll ? "#6d7cff" : "rgba(255,255,255,0.15)"}`,
            background: autoScroll ? "rgba(109,124,255,0.1)" : "transparent",
            color: autoScroll ? "#6d7cff" : "#9fb0ff",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {autoScroll ? "🔒 Auto-scroll ON" : "🔓 Auto-scroll OFF"}
        </button>
      </div>

      {/* Log terminal */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          height: 480,
          overflowY: "auto",
          padding: "14px 16px",
          borderRadius: 12,
          background: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.06)",
          fontFamily: "'Courier New', monospace",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        {filteredLogs.length === 0 ? (
          <div
            style={{
              color: "#555",
              textAlign: "center",
              padding: 40,
              fontSize: 13,
            }}
          >
            {logs.length === 0
              ? "No logs yet. Execute a connector action to see output here."
              : "No logs match the current filter."}
          </div>
        ) : (
          filteredLogs.map((line, i) => {
            const level = detectLogLevel(line);
            const icon = LOG_LEVEL_ICONS[level] || "";
            const color = getLogColor(level);
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  padding: "1px 0",
                  wordBreak: "break-all",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 24,
                    textAlign: "center",
                    opacity: 0.7,
                  }}
                >
                  {icon}
                </span>
                <span style={{ color: "#555", flexShrink: 0 }}>
                  {String(i + 1).padStart(4, " ")}
                </span>
                <span style={{ color, whiteSpace: "pre-wrap" }}>
                  {line}
                </span>
              </div>
            );
          })
        )}

        {/* Bottom padding */}
        <div style={{ height: 8 }} />
      </div>

      {/* Status bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: "#8899cc",
          fontSize: 11,
        }}
      >
        <span>
          Filter: {filter} · Search: {searchTerm ? `"${searchTerm}"` : "none"}
        </span>
        <span>
          Auto-scroll: {autoScroll ? "ON" : "OFF"} · Buffer: {logs.length} lines
        </span>
      </div>
    </div>
  );
}
