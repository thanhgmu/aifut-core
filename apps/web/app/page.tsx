type HealthResponse = {
  status?: string;
  service?: string;
  database?: string;
  timestamp?: string;
};

async function getPlatformHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch("https://api.aifut.net/health", {
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        status: "error",
        service: "api",
        database: "unknown",
      };
    }

    return res.json();
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const health = await getPlatformHealth();

  const apiStatus = health?.status === "ok" ? "online" : "offline";
  const dbStatus = health?.database ?? "unknown";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b1020",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "72px 24px" }}>
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
          AIFUT Core
        </div>

        <h1 style={{ fontSize: "56px", lineHeight: 1.05, margin: "20px 0 16px", maxWidth: 900 }}>
          Build once. Operate lean. Scale like a platform.
        </h1>

        <p style={{ fontSize: 20, lineHeight: 1.7, maxWidth: 820, color: "#c8d2ff" }}>
          AIFUT is the foundation for a SaaS/operator-stack platform designed for
          multi-tenant operation, modular services, AI integration, and deployable
          business systems.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
          <a
            href="https://app.aifut.net"
            style={{
              background: "#6d7cff",
              color: "white",
              padding: "14px 20px",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            AIFUT Foundation v0
          </a>

          <a
            href="https://api.aifut.net"
            style={{
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#f5f7ff",
              padding: "14px 20px",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            API Endpoint
          </a>

          <a
            href="/foundation"
            style={{
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#f5f7ff",
              padding: "14px 20px",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Foundation Core
          </a>

          <a
            href="/foundation/demo"
            style={{
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#f5f7ff",
              padding: "14px 20px",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Foundation Demo
          </a>
        </div>

        <div
          style={{
            marginTop: 28,
            padding: 20,
            borderRadius: 18,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "#9fb0ff",
              marginBottom: 12,
            }}
          >
            Platform status
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <div
              style={{
                padding: 14,
                borderRadius: 14,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 6 }}>API</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{apiStatus}</div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 14,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 6 }}>Database</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{dbStatus}</div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 14,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 6 }}>Endpoint</div>
              <div style={{ fontSize: 16, fontWeight: 700, wordBreak: "break-word" }}>
                api.aifut.net
              </div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 14,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 12, color: "#9fb0ff", marginBottom: 6 }}>Service</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{health?.service ?? "unknown"}</div>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 13, color: "#9fb0ff" }}>
            {health?.timestamp
              ? `Last health timestamp: ${health.timestamp}`
              : "Live status unavailable right now. Frontend is still online."}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginTop: 48,
          }}
        >
          {[
            "Multi-tenant foundation",
            "Operator-first architecture",
            "AI integration ready",
            "Modular product ecosystem",
            "Deployable on owned infrastructure",
            "Built for lean scale",
          ].map((item) => (
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
    </main>
  );
}
