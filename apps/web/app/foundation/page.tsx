"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { API_BASE, AuthSession, fetchAuthMe, getStoredToken } from "../../lib/auth";
import type { HealthResponse } from "../../lib/runtime-data";

type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  tenantId: string;
};

export default function FoundationPage() {
  const [token, setToken] = useState("");
  const [me, setMe] = useState<AuthSession | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = getStoredToken();
    setToken(saved);

    const load = async () => {
      try {
        const healthRes = await fetch(`${API_BASE}/health`, { cache: "no-store" });
        const healthJson = (await healthRes.json()) as HealthResponse;
        setHealth(healthJson);

        if (!saved) {
          setError("No token found. Please sign in to view the authenticated foundation.");
          return;
        }

        const meJson = await fetchAuthMe(saved);
        setMe(meJson);

        const workspaceRes = await fetch(`${API_BASE}/workspaces`, {
          headers: {
            Authorization: `Bearer ${saved}`,
          },
          cache: "no-store",
        });

        const workspaceJson: unknown = await workspaceRes.json();

        if (!workspaceRes.ok) {
          throw new Error(
            getResponseMessage(workspaceJson) ??
              `workspaces failed (${workspaceRes.status})`,
          );
        }

        setWorkspaces(
          Array.isArray(workspaceJson)
            ? workspaceJson.filter(isWorkspaceSummary)
            : [],
        );
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
        <Link href="/" style={{ color: "#9fb0ff", textDecoration: "none", fontSize: 14 }}>
          ← Back to home
        </Link>

        <h1 style={{ fontSize: 42, margin: "18px 0 10px" }}>AIFUT Foundation</h1>
        <p style={{ color: "#c8d2ff", fontSize: 18, lineHeight: 1.7, maxWidth: 820 }}>
          Authenticated foundation view powered by the live JWT session and the public
          AIFUT API.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
          <Link
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
          </Link>

          <Link
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
          </Link>

          <Link
            href="/foundation/demo-live"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              textDecoration: "none",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              fontWeight: 700,
            }}
          >
            Open Live Demo
          </Link>

          <Link
            href="/foundation/operator-preview"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              textDecoration: "none",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              fontWeight: 700,
            }}
          >
            Operator Preview
          </Link>
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
                {workspaces.map((workspace) => (
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

        {/* Developer Tools Section */}
        <div style={{ marginTop: 28 }}>
          <Panel title="Developer Tools">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              <DevToolCard
                icon="📝"
                title="AWL Playground"
                description="Write, validate, and preview AWL workflow documents"
                href="/foundation/awl-playground"
                status="Live"
                statusColor="#80e0a0"
              />
              <DevToolCard
                icon="📦"
                title="Template Packs"
                description="Browse 50 industry templates organized in 8 sellable packs"
                href="/templates"
                status="Live"
                statusColor="#80e0a0"
              />
              <DevToolCard
                icon="🔌"
                title="AIS Specification"
                description="AIFUT Integration Standard — build compliant connectors"
                href={`${API_BASE}/developer/ais-spec`}
                status="Draft"
                statusColor="#ffb366"
              />
              <DevToolCard
                icon="🔧"
                title="API Documentation"
                description="39+ REST API endpoints for platform control"
                href={`${API_BASE}/developer/docs`}
                status="Live"
                statusColor="#80e0a0"
              />
              <DevToolCard
                icon="📋"
                title="Connector SDK"
                description="Node.js SDK for AIS-compliant connectors (@aifut/connector-sdk)"
                href={`${API_BASE}/developer/sdks`}
                status="Beta"
                statusColor="#66c4ff"
              />
              <DevToolCard
                icon="🛣️"
                title="Developer Roadmap"
                description="See what's coming next for the AIFUT developer platform"
                href={`${API_BASE}/developer/roadmap`}
                status="Available"
                statusColor="#9fb0ff"
              />
              <DevToolCard
                icon="📊"
                title="Analytics Dashboard"
                description="Platform-wide metrics, revenue tracking, industry adoption"
                href="/analytics"
                status="Live"
                statusColor="#80e0a0"
              />
              <DevToolCard
                icon="✅"
                title="Connector Certification"
                description="Certify your AIS-compliant connectors for the marketplace"
                href="/developer"
                status="Beta"
                statusColor="#66c4ff"
              />
            </div>
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

function DevToolCard({
  icon,
  title,
  description,
  href,
  status,
  statusColor,
}: {
  icon: string;
  title: string;
  description: string;
  href: string;
  status: string;
  statusColor: string;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      style={{
        textDecoration: "none",
        padding: 18,
        borderRadius: 14,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        transition: "all 0.15s ease",
        cursor: "pointer",
        color: "inherit",
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{title}</div>
      <div style={{ color: "#c8d2ff", fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>
        {description}
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: statusColor,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {status}
      </span>
    </a>
  );
}

function getResponseMessage(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("message" in value)) {
    return null;
  }

  return typeof value.message === "string" ? value.message : null;
}

function isWorkspaceSummary(value: unknown): value is WorkspaceSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "slug" in value &&
    typeof value.slug === "string" &&
    "tenantId" in value &&
    typeof value.tenantId === "string"
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
