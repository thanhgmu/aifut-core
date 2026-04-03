export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif" }}>
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "72px 24px" }}>
        <div style={{ display: "inline-block", padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 999, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#9fb0ff" }}>
          AIFUT Core
        </div>

        <h1 style={{ fontSize: "56px", lineHeight: 1.05, margin: "20px 0 16px", maxWidth: 900 }}>
          Build once. Operate lean. Scale like a platform.
        </h1>

        <p style={{ fontSize: 20, lineHeight: 1.7, maxWidth: 820, color: "#c8d2ff" }}>
          AIFUT is the foundation for a SaaS/operator-stack platform designed for multi-tenant operation,
          modular services, AI integration, and deployable business systems.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
          <a
            href="https://aifut.net"
            style={{
              background: "#6d7cff",
              color: "white",
              padding: "14px 20px",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 700
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
              fontWeight: 700
            }}
          >
            API Endpoint
          </a>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 48 }}>
          {[
            "Multi-tenant foundation",
            "Operator-first architecture",
            "AI integration ready",
            "Modular product ecosystem",
            "Deployable on owned infrastructure",
            "Built for lean scale"
          ].map((item) => (
            <div
              key={item}
              style={{
                padding: 18,
                borderRadius: 16,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)"
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