import { API_BASE, getJson, type AdapterInterfaceRegistryResponse, type HealthResponse } from "../../lib/runtime-data";

type LaneCard = {
  lane: string;
  progress: string;
  done: string[];
  doing: string[];
  eta: string;
};

const lanes: LaneCard[] = [
  {
    lane: "Platform kernel / tenancy",
    progress: "35%",
    done: [
      "tenant summary/current/resolve-host/storage-policy surfaces",
      "workspace + domain + package assignment foundations",
      "roadmap and kernel backlog surfaced in API",
    ],
    doing: [
      "deeper membership/role enforcement",
      "storage-topology and sovereignty hardening",
    ],
    eta: "2–5 weeks to stronger operator-ready foundation",
  },
  {
    lane: "Integration control plane",
    progress: "45%",
    done: [
      "connector registry + templates",
      "adapter contracts",
      "adapter interfaces with request/response shape + runtime binding hints",
      "setup-session and diagnostics groundwork",
    ],
    doing: [
      "interface-aware setup defaults",
      "runtime validation and persistence binding",
      "visible demo surfaces for operators",
    ],
    eta: "1–3 weeks to much stronger visible product proof",
  },
  {
    lane: "Orchestration / governed AI",
    progress: "30%",
    done: [
      "capabilities + roadmap surfaces",
      "execution contracts and runtime activation endpoints",
      "runtime history + diagnostics endpoints",
    ],
    doing: [
      "persistence-first runtime state handling",
      "approval/dispatch flow deepening",
    ],
    eta: "3–6 weeks to credible end-to-end operator demo",
  },
  {
    lane: "Product / GTM / investor story",
    progress: "60%",
    done: [
      "landing-page positioning sharpened",
      "go-to-market positioning doc added",
      "investor-partner story doc added",
    ],
    doing: [
      "turning narrative into visible product screens",
      "making kernel story legible in web demo",
    ],
    eta: "days, not weeks, for stronger demo packaging",
  },
];

async function getDashboardData() {
  const [health, adapterInterfaces, root] = await Promise.all([
    getJson<HealthResponse>("/health"),
    getJson<AdapterInterfaceRegistryResponse>("/connectors/adapter-interfaces"),
    getJson<any>("/"),
  ]);

  return { health, adapterInterfaces, root };
}

export default async function DashboardPage() {
  const { health, adapterInterfaces, root } = await getDashboardData();
  const interfaceCount = adapterInterfaces?.adapterInterfaces?.length ?? 0;
  const topInterfaces = adapterInterfaces?.adapterInterfaces?.slice(0, 3) ?? [];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #08101d 0%, #0d1730 100%)",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
        padding: "40px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1 }}>
              AIFUT execution dashboard
            </div>
            <h1 style={{ fontSize: 44, margin: "10px 0 12px" }}>Progress / now / next / ETA</h1>
            <p style={{ color: "#c8d2ff", fontSize: 18, lineHeight: 1.7, maxWidth: 860 }}>
              One-page live summary for the current local build, with yesterday&apos;s product ideas pushed into visible API/UI proof.
            </p>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
            <LinkButton href="/">Home</LinkButton>
            <LinkButton href="/foundation/demo-live">Visible demo</LinkButton>
            <LinkButton href={`${API_BASE}/connectors/adapter-interfaces`}>Adapter interfaces API</LinkButton>
          </div>
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginTop: 28,
          }}
        >
          <MetricCard title="API" value={health?.status ?? "unknown"} note={`db: ${health?.database ?? "unknown"}`} />
          <MetricCard title="Model" value={health?.platform?.model ?? root?.focus?.model ?? "C"} note="kernel-first control plane" />
          <MetricCard title="Adapter interfaces" value={String(interfaceCount)} note="visible proof of connector abstraction" />
          <MetricCard title="Current theme" value="From narrative → product" note="docs + API + UI now connected" />
        </section>

        <section style={{ marginTop: 36 }}>
          <Panel title="Overall readout">
            <div style={{ display: "grid", gap: 10, color: "#dfe6ff", lineHeight: 1.7 }}>
              <div>• Foundation is real and running locally, not just conceptual.</div>
              <div>• Yesterday&apos;s &quot;future-forward&quot; lane is now anchored in adapter-interface contracts and visible local demo surfaces.</div>
              <div>• The next compounding win is turning these contracts into operator-facing setup/runtime flows.</div>
            </div>
          </Panel>
        </section>

        <section style={{ marginTop: 28 }}>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            Lane-by-lane status
          </div>
          <div style={{ display: "grid", gap: 18 }}>
            {lanes.map((lane) => (
              <Panel key={lane.lane} title={`${lane.lane} • ${lane.progress}`}>
                <LaneSection label="Done" items={lane.done} />
                <LaneSection label="Doing now" items={lane.doing} />
                <div style={{ marginTop: 14, color: "#9fb0ff", fontSize: 14 }}>ETA: {lane.eta}</div>
              </Panel>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 28 }}>
          <Panel title="Yesterday's visible proof slice">
            {topInterfaces.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
                {topInterfaces.map((item) => (
                  <div key={item.key} style={cardStyle}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{item.key}</div>
                    <div style={{ marginTop: 6, color: "#9fb0ff", fontSize: 13 }}>{item.appDefinitionKey} • {item.connectorKey}</div>
                    <div style={{ marginTop: 14, fontSize: 14 }}>Request: <strong>{item.requestShape}</strong></div>
                    <div style={{ marginTop: 6, fontSize: 14 }}>Response: <strong>{item.responseShape}</strong></div>
                    <div style={{ marginTop: 10, fontSize: 13, color: "#c8d2ff" }}>Activation: {item.activationPolicy}</div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#c8d2ff" }}>Runtime: {item.runtimeBinding}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#c8d2ff" }}>Adapter interface data is unavailable right now.</div>
            )}
          </Panel>
        </section>
      </div>
    </main>
  );
}

function MetricCard({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div>
      <div style={{ marginTop: 8, color: "#c8d2ff", fontSize: 13 }}>{note}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 22, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontSize: 13, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

function LaneSection({ label, items }: { label: string; items: string[] }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 13, color: "#9fb0ff", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "grid", gap: 6 }}>
        {items.map((item) => (
          <div key={item} style={{ color: "#dfe6ff", lineHeight: 1.6 }}>• {item}</div>
        ))}
      </div>
    </div>
  );
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        padding: "12px 16px",
        borderRadius: 12,
        textDecoration: "none",
        background: "rgba(255,255,255,0.06)",
        color: "white",
        fontWeight: 700,
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {children}
    </a>
  );
}

const cardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 18,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};
