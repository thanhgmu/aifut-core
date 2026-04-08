"use client";

import { useEffect, useMemo, useState } from "react";

const API = "https://api.aifut.net";

type SessionPayload = {
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

export default function FoundationPage() {
  const [token, setToken] = useState("");
  const [me, setMe] = useState<SessionPayload | null>(null);
  const [workspaces, setWorkspaces] = useState<any[] | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("aifut_token") || "";
    setToken(saved);

    const load = async () => {
      try {
        const healthRes = await fetch(`${API}/health`, { cache: "no-store" });
        const healthJson = await healthRes.json();
        setHealth(healthJson);

        if (!saved) {
          setError("No token found. Please sign in to view the authenticated foundation.");
          return;
        }

        const meRes = await fetch(`${API}/auth/me`, {
          headers: {
            Authorization: `Bearer ${saved}`,
          },
          cache: "no-store",
        });

        const meJson = await meRes.json();

        if (!meRes.ok) {
          throw new Error(meJson?.message || `auth/me failed (${meRes.status})`);
        }

        setMe(meJson);

        const workspaceRes = await fetch(`${API}/workspaces`, {
          headers: {
            Authorization: `Bearer ${saved}`,
          },
          cache: "no-store",
        });

        const workspaceJson = await workspaceRes.json();

        if (!workspaceRes.ok) {
          throw new Error(
            workspaceJson?.message || `workspaces failed (${workspaceRes.status})`,
          );
        }

        setWorkspaces(Array.isArray(workspaceJson) ? workspaceJson : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load foundation data");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const status = useMemo(() => {
    if (loading) return "Loading foundation...";
    if (me?.user) return "Authenticated";
    return "Not authenticated";
  }, [loading, me]);

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
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <a href="/" style={{ color: "#9fb0ff", textDecoration: "none", fontSize: 14 }}>
          ← Back to home
        </a>

        <h1 style={{ fontSize: 42, margin: "18px 0 10px" }}>AIFUT Foundation</h1>
        <p style={{ color: "#c8d2ff", fontSize: 18, lineHeight: 1.7, maxWidth: 820 }}>
          Authenticated foundation view powered by the live JWT session and the public
          AIFUT API.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
          <a
            href="/login"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              textDecoration: "none",
              background: "#6d7cff",
              color: "white",
              fontWeight: 700,
            }}
          >
            Go to Login
          </a>

          <a
            href="/session"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              textDecoration: "none",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              fontWeight: 700,
            }}
          >
            View Session
          </a>

          <a
            href="/foundation/demo"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              textDecoration: "none",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              fontWeight: 700,
            }}
          >
            Open Demo Route
          </a>
        </div>

        <div
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 14,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#c8d2ff",
          }}
        >
          Status: <strong>{status}</strong>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginTop: 28,
          }}
        >
          <Box title="API Status" value={health?.status ?? "unknown"} />
          <Box title="Database" value={health?.database ?? "unknown"} />
          <Box title="Tenant" value={me?.tenant?.name ?? "Unavailable"} />
          <Box title="Role" value={me?.membership?.role ?? "Unavailable"} />
        </div>

        {error ? (
          <div
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 14,
              background: "rgba(255, 80, 80, 0.12)",
              border: "1px solid rgba(255, 80, 80, 0.25)",
              color: "#ffb3b3",
              whiteSpace: "pre-wrap",
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
            marginTop: 28,
          }}
        >
          <Panel title="Current user">
            <Row label="Name" value={me?.user?.name ?? "N/A"} />
            <Row label="Email" value={me?.user?.email ?? "N/A"} />
            <Row label="User ID" value={me?.user?.id ?? "N/A"} />
          </Panel>

          <Panel title="Current tenant">
            <Row label="Name" value={me?.tenant?.name ?? "N/A"} />
            <Row label="Slug" value={me?.tenant?.slug ?? "N/A"} />
            <Row label="Tenant ID" value={me?.tenant?.id ?? "N/A"} />
          </Panel>
        </div>

        <div style={{ marginTop: 28 }}>
          <Panel title="Workspaces">
            {Array.isArray(workspaces) && workspaces.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 16,
                }}
              >
                {workspaces.map((workspace: any) => (
                  <div
                    key={workspace.id}
                    style={{
                      padding: 18,
                      borderRadius: 16,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{workspace.name}</div>
                    <div style={{ marginTop: 6, color: "#9fb0ff", fontSize: 13 }}>
                      slug: {workspace.slug}
                    </div>
                    <div style={{ marginTop: 6, color: "#9fb0ff", fontSize: 13 }}>
                      tenantId: {workspace.tenantId}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#c8d2ff" }}>No workspace data returned.</div>
            )}
          </Panel>
        </div>

        <div style={{ marginTop: 28 }}>
          <Panel title="Debug snapshot">
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
              {JSON.stringify({ me, workspaces, health, tokenPresent: Boolean(token) }, null, 2)}
            </pre>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Box({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 18,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 700, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 18,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: "#9fb0ff",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 14,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}
