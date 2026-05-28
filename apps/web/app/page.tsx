import { getJson, type HealthResponse } from "../lib/runtime-data";

const valuePillars = [
  {
    title: "One control plane",
    body: "Unify apps, workflows, AI, and operator controls instead of stitching together more tool sprawl.",
  },
  {
    title: "Governed AI execution",
    body: "Route tasks with policy, quota, cost, and approval boundaries instead of treating AI like an unbounded black box.",
  },
  {
    title: "Flexible data sovereignty",
    body: "Support shared, split, self-hosted, and hybrid topologies without breaking the platform model.",
  },
  {
    title: "Natural-language operations",
    body: "Turn business intent into structured workflows, connector setup, and future app/plugin/skill creation.",
  },
];

const audienceCards = [
  "Lean operators running multi-tool businesses",
  "SMEs with fragmented CRM, commerce, and automation stacks",
  "Implementation partners, agencies, and AI operators",
  "Reseller and white-label builders who need multi-tenant control",
];

const capabilityCards = [
  "Tenant-aware orchestration and policy boundaries",
  "Integration contracts instead of brittle one-off glue",
  "AI routing, quota, and cost-governance foundations",
  "Runtime history, diagnostics, and operator visibility",
  "Domain, storage, and topology-aware platform design",
  "A path toward user-generated apps, workflows, plugins, and skills",
];

async function getPlatformHealth(): Promise<HealthResponse | null> {
  return getJson<HealthResponse>("/health");
}

function StatusCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 16,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

export default async function HomePage() {
  const health = await getPlatformHealth();

  const apiStatus = health?.status === "ok" ? "online" : "offline";
  const dbStatus = health?.database ?? "unknown";

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(109,124,255,0.16), transparent 30%), #0b1020",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section style={{ maxWidth: 1160, margin: "0 auto", padding: "72px 24px 88px" }}>
        <div
          style={{
            display: "inline-block",
            padding: "6px 12px",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 999,
            fontSize: 12,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "#9fb0ff",
          }}
        >
          AIFUT Core • AI-native operating system
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 28,
            alignItems: "start",
            marginTop: 20,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "clamp(42px, 8vw, 68px)",
                lineHeight: 1.02,
                margin: "0 0 18px",
                maxWidth: 900,
              }}
            >
              Turn app chaos into an intelligent operator stack.
            </h1>

            <p style={{ fontSize: 21, lineHeight: 1.7, maxWidth: 820, color: "#c8d2ff" }}>
              AIFUT is the control plane for multi-tenant businesses that need apps,
              workflows, AI, operators, and data to behave like one governed system.
            </p>

            <p style={{ fontSize: 18, lineHeight: 1.7, maxWidth: 820, color: "#9fb0ff" }}>
              Not another CRM. Not another automation canvas. Not another agent wrapper.
              AIFUT is the kernel above them.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 30 }}>
              <a
                href="/foundation"
                style={{
                  background: "#6d7cff",
                  color: "white",
                  padding: "14px 20px",
                  borderRadius: 12,
                  textDecoration: "none",
                  fontWeight: 700,
                }}
              >
                Explore Foundation
              </a>

              <a
                href="http://localhost:3002"
                style={{
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#f5f7ff",
                  padding: "14px 20px",
                  borderRadius: 12,
                  textDecoration: "none",
                  fontWeight: 700,
                }}
              >
                View Local API
              </a>

              <a
                href="/dashboard"
                style={{
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#f5f7ff",
                  padding: "14px 20px",
                  borderRadius: 12,
                  textDecoration: "none",
                  fontWeight: 700,
                }}
              >
                Open Dashboard
              </a>
            </div>
          </div>

          <div
            style={{
              padding: 22,
              borderRadius: 22,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: "#9fb0ff",
                marginBottom: 14,
              }}
            >
              Platform status
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
              }}
            >
              <StatusCard label="API" value={apiStatus} />
              <StatusCard label="Database" value={dbStatus} />
              <StatusCard label="Service" value={health?.service ?? "unknown"} />
              <StatusCard label="Endpoint" value="localhost:3002" />
            </div>

            <div style={{ marginTop: 14, fontSize: 13, color: "#9fb0ff" }}>
              {health?.timestamp
                ? `Last health timestamp: ${health.timestamp}`
                : "Live status unavailable right now. Frontend is still online."}
            </div>

            <div
              style={{
                marginTop: 18,
                paddingTop: 18,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 14, color: "#9fb0ff" }}>Current foundation</div>
              {[
                "Tenant-native control plane",
                "Connector and adapter contract foundation",
                "AI routing and quota governance groundwork",
                "Execution runtime history and diagnostics",
              ].map((item) => (
                <div key={item} style={{ fontSize: 15, lineHeight: 1.5 }}>
                  • {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <section style={{ marginTop: 72 }}>
          <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#9fb0ff" }}>
            Why AIFUT matters
          </div>
          <h2 style={{ fontSize: 34, margin: "12px 0 12px" }}>
            One system to connect tools, govern execution, and scale a lean team.
          </h2>
          <p style={{ maxWidth: 860, color: "#c8d2ff", lineHeight: 1.8, fontSize: 17 }}>
            Most businesses are trapped between SaaS sprawl, brittle automations, and AI
            tools that do not understand policy, cost, or operational truth. AIFUT is
            designed to unify those layers so a small operator team can run a much larger
            business system with more clarity and less glue.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              marginTop: 24,
            }}
          >
            {valuePillars.map((pillar) => (
              <div
                key={pillar.title}
                style={{
                  padding: 20,
                  borderRadius: 18,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{pillar.title}</div>
                <div style={{ color: "#c8d2ff", lineHeight: 1.7 }}>{pillar.body}</div>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 18,
            marginTop: 72,
          }}
        >
          <div
            style={{
              padding: 22,
              borderRadius: 20,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#9fb0ff" }}>
              Built for
            </div>
            <h3 style={{ fontSize: 28, margin: "12px 0 14px" }}>Operators who need leverage</h3>
            <div style={{ display: "grid", gap: 10, color: "#c8d2ff", lineHeight: 1.7 }}>
              {audienceCards.map((item) => (
                <div key={item}>• {item}</div>
              ))}
            </div>
          </div>

          <div
            style={{
              padding: 22,
              borderRadius: 20,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#9fb0ff" }}>
              What it enables
            </div>
            <h3 style={{ fontSize: 28, margin: "12px 0 14px" }}>From intent to governed execution</h3>
            <div style={{ display: "grid", gap: 10, color: "#c8d2ff", lineHeight: 1.7 }}>
              <div>• Describe business goals in natural language</div>
              <div>• Map workflows across multiple apps and teams</div>
              <div>• Route AI work by cost, risk, and quality needs</div>
              <div>• Observe runtime state, history, and failure paths</div>
              <div>• Grow toward user-generated app, plugin, and skill creation</div>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 72 }}>
          <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#9fb0ff" }}>
            Core capabilities
          </div>
          <h2 style={{ fontSize: 34, margin: "12px 0 18px" }}>
            The platform kernel above your tools.
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            {capabilityCards.map((item) => (
              <div
                key={item}
                style={{
                  padding: 18,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
