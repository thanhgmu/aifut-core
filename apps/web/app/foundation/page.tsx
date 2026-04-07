type MeResponse = {
  user: { id: string; email: string; name: string | null } | null;
  tenant: { id: string; name: string; slug: string } | null;
  membership: { id: string; role: string } | null;
};

type TenantResponse = {
  tenant: { id: string; name: string; slug: string } | null;
  membership: { id: string; role: string } | null;
};

type Workspace = {
  id: string;
  name: string;
  slug: string;
  tenantId: string;
};

const API_BASE = "https://api.aifut.net";

const headers = {
  "x-dev-user-email": "admin@aifut.local",
  "x-tenant-slug": "aifut-core",
};

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers,
      cache: "no-store",
    });

    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function FoundationPage() {
  const [me, tenantContext, workspaces] = await Promise.all([
    getJson<MeResponse>("/me"),
    getJson<TenantResponse>("/tenants/current"),
    getJson<Workspace[]>("/workspaces"),
  ]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#09111f",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px" }}>
        <a
          href="/"
          style={{
            color: "#9fb0ff",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          ← Back to home
        </a>

        <div style={{ marginTop: 20 }}>
          <div
            style={{
              display: "inline-block",
              padding: "6px 12px",
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: 999,
              fontSize: 12,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "#9fb0ff",
            }}
          >
            Foundation dashboard
          </div>

          <h1 style={{ fontSize: 42, margin: "18px 0 12px" }}>
            AIFUT Foundation Runtime
          </h1>

          <p style={{ color: "#c8d2ff", fontSize: 18, lineHeight: 1.7, maxWidth: 860 }}>
            This page verifies the current full-stack path from the public web app to
            the public API using the current dev context on the live VPS deployment.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
            marginTop: 32,
          }}
        >
          <Card title="API Base" value={API_BASE} />
          <Card title="Tenant" value={tenantContext?.tenant?.name ?? "Unavailable"} />
          <Card title="Tenant Slug" value={tenantContext?.tenant?.slug ?? "Unavailable"} />
          <Card title="Membership Role" value={tenantContext?.membership?.role ?? "Unavailable"} />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: 20,
            marginTop: 28,
          }}
        >
          <Panel title="Current user">
            <JsonBlock data={me} />
          </Panel>

          <Panel title="Tenant context">
            <JsonBlock data={tenantContext} />
          </Panel>
        </div>

        <div style={{ marginTop: 28 }}>
          <Panel title="Workspaces">
            {workspaces && workspaces.length > 0 ? (
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
                    <div style={{ marginTop: 8, color: "#9fb0ff" }}>slug: {workspace.slug}</div>
                    <div style={{ marginTop: 6, color: "#9fb0ff", fontSize: 13 }}>
                      tenantId: {workspace.tenantId}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#c8d2ff" }}>No workspaces returned.</div>
            )}
          </Panel>
        </div>
      </section>
    </main>
  );
}

function Card({ title, value }: { title: string; value: string }) {
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
      <div style={{ fontSize: 18, fontWeight: 700, wordBreak: "break-word" }}>{value}</div>
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

function JsonBlock({ data }: { data: unknown }) {
  return (
    <pre
      style={{
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        color: "#dfe6ff",
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
