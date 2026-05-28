import { API_BASE, getJson, type AdapterInterfaceRegistryResponse, type HealthResponse } from "../../../lib/runtime-data";

async function getLiveDemoData() {
  const [health, interfaces, contracts, templates] = await Promise.all([
    getJson<HealthResponse>("/health"),
    getJson<AdapterInterfaceRegistryResponse>("/connectors/adapter-interfaces"),
    getJson<any>("/connectors/adapter-contracts"),
    getJson<any>("/connectors/templates"),
  ]);

  return { health, interfaces, contracts, templates };
}

export default async function DemoLivePage() {
  const { health, interfaces, contracts, templates } = await getLiveDemoData();
  const records = interfaces?.adapterInterfaces ?? [];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#08101d",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
        padding: "40px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <a href="/dashboard" style={{ color: "#9fb0ff", textDecoration: "none", fontSize: 14 }}>
          ← Back to dashboard
        </a>

        <h1 style={{ fontSize: 42, margin: "18px 0 12px" }}>Visible demo — governed adapter interfaces</h1>
        <p style={{ color: "#c8d2ff", fontSize: 18, lineHeight: 1.7, maxWidth: 860 }}>
          This is the clearest current proof of the &quot;kernel above tools&quot; idea: AIFUT does not just list connectors. It defines normalized interfaces, activation policy, and runtime binding so apps, AI, workflows, and operator actions can be coordinated under one control plane.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
          <LinkButton href={`${API_BASE}/health`}>/health</LinkButton>
          <LinkButton href={`${API_BASE}/connectors/adapter-interfaces`}>/connectors/adapter-interfaces</LinkButton>
          <LinkButton href={`${API_BASE}/connectors/templates`}>/connectors/templates</LinkButton>
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginTop: 28,
          }}
        >
          <MetricCard title="API status" value={health?.status ?? "unknown"} />
          <MetricCard title="Database" value={health?.database ?? "unknown"} />
          <MetricCard title="Adapter interfaces" value={String(records.length)} />
          <MetricCard title="Templates" value={String(templates?.templates?.length ?? 0)} />
        </section>

        <section style={{ marginTop: 28 }}>
          <Panel title="Why this matters">
            <Bullet>Normal connectors only say what system can connect.</Bullet>
            <Bullet>Adapter interfaces say what business-safe request/response contract AIFUT expects.</Bullet>
            <Bullet>That creates the path for natural-language setup, governed AI execution, approval gates, and reusable runtime contracts.</Bullet>
          </Panel>
        </section>

        <section style={{ marginTop: 28 }}>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            Live interface cards
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
            {records.map((item) => (
              <div key={item.key} style={cardStyle}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{item.key}</div>
                <div style={{ marginTop: 6, color: "#9fb0ff", fontSize: 13 }}>
                  app: {item.appDefinitionKey} • connector: {item.connectorKey}
                </div>

                <div style={{ marginTop: 16 }}>
                  <Label>Contract</Label>
                  <div>{item.adapterContractKey}</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Label>Request / Response</Label>
                  <div>{item.requestShape} → {item.responseShape}</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Label>Activation policy</Label>
                  <div>{item.activationPolicy}</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Label>Runtime binding</Label>
                  <div>{item.runtimeBinding}</div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <Label>Normalized inputs</Label>
                  <TagList items={item.normalizedInputs} />
                </div>
                <div style={{ marginTop: 14 }}>
                  <Label>Normalized outputs</Label>
                  <TagList items={item.normalizedOutputs} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 28 }}>
          <Panel title="Roadmap hooks already exposed in API">
            <div style={{ display: "grid", gap: 8 }}>
              {(interfaces?.next ?? []).map((item) => (
                <div key={item} style={{ color: "#dfe6ff" }}>• {item}</div>
              ))}
              {(contracts?.next ?? []).slice(0, 3).map((item: string) => (
                <div key={item} style={{ color: "#dfe6ff" }}>• {item}</div>
              ))}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={{ padding: "10px 14px", borderRadius: 12, textDecoration: "none", background: "rgba(255,255,255,0.06)", color: "white", fontWeight: 700 }}>
      {children}
    </a>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "#dfe6ff", lineHeight: 1.7 }}>• {children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 6 }}>{children}</div>;
}

function TagList({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {items.map((item) => (
        <span key={item} style={{ padding: "6px 10px", borderRadius: 999, background: "rgba(109,124,255,0.16)", border: "1px solid rgba(109,124,255,0.32)", fontSize: 12 }}>
          {item}
        </span>
      ))}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: 20,
  borderRadius: 18,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};
