const API = "https://api.aifut.net";

async function getData(path: string) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      "x-dev-user-email": "admin@aifut.local",
      "x-tenant-slug": "aifut-core",
    },
    cache: "no-store",
  });

  if (!res.ok) return null;
  return res.json();
}

export default async function FoundationPage() {
  const [me, tenantContext, workspaces, health] = await Promise.all([
    getData("/me"),
    getData("/tenants/current"),
    getData("/workspaces"),
    getData("/health"),
  ]);

  const user = me?.user;
  const tenant = tenantContext?.tenant;
  const membership = tenantContext?.membership;

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
          A live foundation view powered by the public AIFUT API and the current dev
          context running on the VPS deployment.
        </p>

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
          <Box title="Tenant" value={tenant?.name ?? "Unavailable"} />
          <Box title="Role" value={membership?.role ?? "Unavailable"} />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
            marginTop: 28,
          }}
        >
          <Panel title="Current user">
            <Row label="Name" value={user?.name ?? "N/A"} />
            <Row label="Email" value={user?.email ?? "N/A"} />
            <Row label="User ID" value={user?.id ?? "N/A"} />
          </Panel>

          <Panel title="Current tenant">
            <Row label="Name" value={tenant?.name ?? "N/A"} />
            <Row label="Slug" value={tenant?.slug ?? "N/A"} />
            <Row label="Tenant ID" value={tenant?.id ?? "N/A"} />
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
                    <div style={{ marginTop: 8, color: "#9fb0ff" }}>slug: {workspace.slug}</div>
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
              {JSON.stringify({ me, tenantContext, workspaces, health }, null, 2)}
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
