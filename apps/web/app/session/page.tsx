"use client";

import { useEffect, useMemo, useState } from "react";

const API = "https://api.aifut.net";

type SessionData = {
  token?: string;
  user?: {
    id: string;
    email: string;
    name?: string | null;
  } | null;
  tenant?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  membership?: {
    id: string;
    role: string;
    tenantId: string;
    userId: string;
  } | null;
};

export default function SessionPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("aifut_token") || "";
    setToken(saved);

    if (!saved) {
      setLoading(false);
      setError("No token found in localStorage. Please sign in first.");
      return;
    }

    const run = async () => {
      try {
        const res = await fetch(`${API}/auth/me`, {
          headers: {
            Authorization: `Bearer ${saved}`,
          },
        });

        const json = await res.json();

        if (!res.ok) {
          throw new Error(json?.message || `auth/me failed (${res.status})`);
        }

        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const status = useMemo(() => {
    if (loading) return "Loading session...";
    if (data?.user) return "Authenticated";
    return "Not authenticated";
  }, [loading, data]);

  function handleLogout() {
    window.localStorage.removeItem("aifut_token");
    setToken("");
    setData(null);
    setError("Signed out. Token removed from localStorage.");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#09111f",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
        padding: "48px 24px",
      }}
    >
      <section style={{ maxWidth: 860, margin: "0 auto" }}>
        <a
          href="/"
          style={{ color: "#9fb0ff", textDecoration: "none", fontSize: 14 }}
        >
          ← Back to home
        </a>

        <h1 style={{ fontSize: 42, margin: "18px 0 10px" }}>Current Session</h1>
        <p style={{ color: "#c8d2ff", fontSize: 18, lineHeight: 1.7 }}>
          This page reads the saved JWT from localStorage and resolves the live
          API session via <code>/auth/me</code>.
        </p>

        <div
          style={{
            marginTop: 18,
            display: "inline-block",
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#9fb0ff",
            fontSize: 13,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          Status: {status}
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 20,
            marginBottom: 24,
          }}
        >
          <a
            href="/login"
            style={{
              background: "#6d7cff",
              color: "white",
              padding: "12px 16px",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Go to Login
          </a>

          <a
            href="/foundation"
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#f5f7ff",
              padding: "12px 16px",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Go to Foundation
          </a>

          <button
            onClick={handleLogout}
            style={{
              background: "transparent",
              color: "#f5f7ff",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "12px 16px",
              borderRadius: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>

        <div
          style={{
            padding: 20,
            borderRadius: 18,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Row label="API" value={API} />
          <Row label="Token present" value={token ? "Yes" : "No"} />
          <Row
            label="User"
            value={
              data?.user
                ? `${data.user.name || "N/A"} / ${data.user.email}`
                : "N/A"
            }
          />
          <Row
            label="Tenant"
            value={
              data?.tenant ? `${data.tenant.name} / ${data.tenant.slug}` : "N/A"
            }
          />
          <Row
            label="Role"
            value={data?.membership?.role ? data.membership.role : "N/A"}
          />

          {error ? (
            <div
              style={{
                marginTop: 18,
                padding: 12,
                borderRadius: 12,
                background: "rgba(255, 80, 80, 0.12)",
                border: "1px solid rgba(255, 80, 80, 0.25)",
                color: "#ffb3b3",
                whiteSpace: "pre-wrap",
              }}
            >
              {error}
            </div>
          ) : null}

          <div style={{ marginTop: 20 }}>
            <div
              style={{
                fontSize: 13,
                color: "#9fb0ff",
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 10,
              }}
            >
              Raw session payload
            </div>
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "#dfe6ff",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        </div>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, wordBreak: "break-word" }}>
        {value}
      </div>
    </div>
  );
}
