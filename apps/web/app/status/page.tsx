"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../../lib/auth";

type HealthCheck = {
  name: string; endpoint: string; status: "ok" | "error" | "loading";
  message?: string; latency?: number;
};

export default function StatusPage() {
  const [checks, setChecks] = useState<HealthCheck[]>([
    { name: "API Server", endpoint: "/health", status: "loading" },
    { name: "Auth", endpoint: "/auth/capabilities", status: "loading" },
    { name: "Analytics", endpoint: "/analytics/capabilities", status: "loading" },
    { name: "Marketplace", endpoint: "/marketplace/capabilities", status: "loading" },
    { name: "Globalization", endpoint: "/globalization/capabilities", status: "loading" },
    { name: "Developer Portal", endpoint: "/developer/stats", status: "loading" },
    { name: "Connector Certification", endpoint: "/certification/stats/summary", status: "loading" },
  ]);
  const [apiLatency, setApiLatency] = useState<number | null>(null);

  useEffect(() => {
    const runChecks = async () => {
      const newChecks = [...checks];

      for (let i = 0; i < newChecks.length; i++) {
        const check = newChecks[i];
        const start = performance.now();
        try {
          const res = await fetch(`${API_BASE}${check.endpoint}`);
          const latency = Math.round(performance.now() - start);
          check.latency = latency;

          if (res.ok) {
            check.status = "ok";
            check.message = `${res.status} in ${latency}ms`;
          } else {
            check.status = "error";
            check.message = `${res.status} in ${latency}ms`;
          }
        } catch {
          check.status = "error";
          check.message = "Unreachable";
        }
      }

      setChecks(newChecks);
      if (newChecks[0]?.latency) setApiLatency(newChecks[0].latency);
    };

    runChecks();
  }, []);

  const okCount = checks.filter((c) => c.status === "ok").length;
  const totalCount = checks.length;

  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif" }}>
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "24px 32px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>System Status</div>
          <h1 style={{ fontSize: 32, margin: 0 }}>Platform Health</h1>
          <p style={{ color: "#c8d2ff", fontSize: 15, marginTop: 4 }}>
            {okCount === totalCount
              ? "✅ All systems operational"
              : `⚠️ ${okCount}/${totalCount} services healthy`}
            {apiLatency !== null && ` · API latency: ${apiLatency}ms`}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: 32 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <span style={{
            padding: "4px 12px", borderRadius: 999, fontSize: 12,
            background: "rgba(74,222,128,0.1)", color: "#4ade80",
            border: "1px solid rgba(74,222,128,0.2)",
          }}>✅ Operational: {okCount}</span>
          <span style={{
            padding: "4px 12px", borderRadius: 999, fontSize: 12,
            background: "rgba(248,113,113,0.1)", color: "#f87171",
            border: "1px solid rgba(248,113,113,0.2)",
          }}>❌ Errors: {totalCount - okCount}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {checks.map((check) => (
            <div key={check.name} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "16px 20px", borderRadius: 12,
              background: check.status === "ok"
                ? "rgba(74,222,128,0.04)"
                : check.status === "error"
                ? "rgba(248,113,113,0.04)"
                : "rgba(255,255,255,0.03)",
              border: check.status === "ok"
                ? "1px solid rgba(74,222,128,0.15)"
                : check.status === "error"
                ? "1px solid rgba(248,113,113,0.15)"
                : "1px solid rgba(255,255,255,0.06)",
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{check.name}</div>
                <div style={{ fontSize: 12, color: "#8899cc", marginTop: 2 }}>{check.endpoint}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                {check.status === "loading" ? (
                  <span style={{ color: "#9fb0ff", fontSize: 13 }}>Checking...</span>
                ) : (
                  <>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: check.status === "ok" ? "#4ade80" : "#f87171",
                    }}>
                      {check.status === "ok" ? "✅ Operational" : "❌ Error"}
                    </div>
                    <div style={{ fontSize: 12, color: "#8899cc", marginTop: 2 }}>
                      {check.message}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 32, padding: 20, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <h3 style={{ fontSize: 14, margin: "0 0 12px", color: "#c8d2ff" }}>System Info</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
            <div><span style={{ color: "#8899cc" }}>API Base:</span> {API_BASE}</div>
            <div><span style={{ color: "#8899cc" }}>Services:</span> {totalCount} endpoints</div>
            <div><span style={{ color: "#8899cc" }}>Locales:</span> 7 languages</div>
            <div><span style={{ color: "#8899cc" }}>Runtime:</span> Node.js + NestJS</div>
            <div><span style={{ color: "#8899cc" }}>Database:</span> PostgreSQL 16</div>
            <div><span style={{ color: "#8899cc" }}>Git SHA:</span> <code style={{ fontSize: 11, color: "#9fb0ff" }}>{process.env.NEXT_PUBLIC_GIT_SHA || "dev"}</code></div>
          </div>
        </div>
      </div>
    </main>
  );
}
