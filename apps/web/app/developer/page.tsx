"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../lib/auth";

export default function DeveloperPortalPage() {
  const [aisSpec, setAisSpec] = useState<any>(null);
  const [sdks, setSdks] = useState<any>(null);
  const [webhooks, setWebhooks] = useState<any>(null);
  const [certification, setCertification] = useState<any>(null);
  const [roadmap, setRoadmap] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [aisRes, sdkRes, whRes, certRes, roadRes] = await Promise.all([
        fetch(`${API_BASE}/developer/ais-spec`).then((r) => r.json()).catch(() => null),
        fetch(`${API_BASE}/developer/sdks`).then((r) => r.json()).catch(() => null),
        fetch(`${API_BASE}/developer/webhooks`).then((r) => r.json()).catch(() => null),
        fetch(`${API_BASE}/developer/certification`).then((r) => r.json()).catch(() => null),
        fetch(`${API_BASE}/developer/roadmap`).then((r) => r.json()).catch(() => null),
      ]);
      setAisSpec(aisRes);
      setSdks(sdkRes);
      setWebhooks(whRes);
      setCertification(certRes);
      setRoadmap(roadRes);
      setLoading(false);
    };
    load();
  }, []);

  const tabs = [
    { id: "overview", label: "Overview", icon: "🏠" },
    { id: "ais", label: "AIS Spec", icon: "📋" },
    { id: "sdks", label: "SDKs", icon: "🔧" },
    { id: "webhooks", label: "Webhooks", icon: "🔌" },
    { id: "api", label: "API Reference", icon: "📡" },
    { id: "roadmap", label: "Roadmap", icon: "🗺️" },
  ];

  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "24px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>AIFUT Developer Portal</div>
          <h1 style={{ fontSize: 32, margin: "0" }}>Developers</h1>
          <p style={{ color: "#c8d2ff", fontSize: 15, marginTop: 4 }}>
            Build AIS-compliant connectors, integrate with AIFUT workflows, and join the ecosystem.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 32px", display: "flex", gap: 4, overflowX: "auto" }}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "12px 20px",
            borderRadius: 0,
            border: "none",
            borderBottom: activeTab === tab.id ? "2px solid #6d7cff" : "2px solid transparent",
            background: "transparent",
            color: activeTab === tab.id ? "#6d7cff" : "#9fb0ff",
            fontWeight: activeTab === tab.id ? 700 : 400,
            cursor: "pointer",
            fontSize: 14,
            whiteSpace: "nowrap",
          }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9fb0ff" }}>Loading...</div>
        ) : (
          <>
            {activeTab === "overview" && <OverviewTab webhooks={webhooks} sdks={sdks} roadmap={roadmap} certification={certification} />}
            {activeTab === "ais" && <AisSpecTab spec={aisSpec} />}
            {activeTab === "sdks" && <SdksTab sdks={sdks} />}
            {activeTab === "webhooks" && <WebhooksTab webhooks={webhooks} />}
            {activeTab === "api" && <ApiTab />}
            {activeTab === "roadmap" && <RoadmapTab roadmap={roadmap} certification={certification} />}
          </>
        )}
      </div>

      <footer style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 32px 48px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16, color: "#9fb0ff", fontSize: 13 }}>
        <div>© 2026 AIFUT — Developer Portal</div>
        <div style={{ display: "flex", gap: 16 }}>
          <Link href="/" style={{ color: "#9fb0ff", textDecoration: "none" }}>Home</Link>
          <Link href="/foundation" style={{ color: "#9fb0ff", textDecoration: "none" }}>Foundation</Link>
          <Link href="/pricing" style={{ color: "#9fb0ff", textDecoration: "none" }}>Pricing</Link>
        </div>
      </footer>
    </main>
  );
}

// ── Tab Components ──────────────────────────────────────────────────────

function OverviewTab({ webhooks, sdks, roadmap, certification }: any) {
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Section title="Getting Started">
        <p style={{ color: "#c8d2ff", lineHeight: 1.7 }}>AIFUT Integration Standard (AIS) defines how external systems connect to AIFUT. Build once, reach all tenants.</p>
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <QuickLink icon="📋" title="AIS Specification" desc="Open standard for connector integration" href="/foundation" />
        <QuickLink icon="🔧" title="Node.js SDK" desc={sdks?.sdks?.[0]?.status === "planned" ? "Coming Q3 2026" : "@aifut/connector-sdk"} href={`${API_BASE}/developer/sdks`} />
        <QuickLink icon="🐍" title="Python SDK" desc={sdks?.sdks?.[1]?.status === "planned" ? "Coming Q3 2026" : "aifut-connector-sdk"} href={`${API_BASE}/developer/sdks`} />
        <QuickLink icon="🔌" title="Webhooks" desc={`${webhooks?.events?.length || 0} event types`} href={`${API_BASE}/developer/webhooks`} />
        <QuickLink icon="🏆" title="Certification" desc={`${certification?.checklist?.length || 0} checklist items`} href={`${API_BASE}/developer/certification`} />
        <QuickLink icon="🗺️" title="Roadmap" desc={`${roadmap?.roadmap?.filter((r: any) => r.status === "done").length || 0}/${roadmap?.roadmap?.length || 0} complete`} href={`${API_BASE}/developer/roadmap`} />
      </div>

      {/* AIS Code Example */}
      <Section title="Connector Quick Start (Node.js)">
        <pre style={{ background: "rgba(0,0,0,0.3)", padding: 20, borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", color: "#c8d2ff", fontSize: 13, lineHeight: 1.6, overflowX: "auto" }}>
{`const { AisConnector } = require('@aifut/connector-sdk');

const myConnector = new AisConnector({
  name: 'MyCRM',
  version: '1.0.0',
  actions: [{
    key: 'create_contact',
    name: 'Create Contact',
    handler: async (input) => {
      // Your API logic here
      return { id: '123', status: 'created' };
    },
  }],
});

// Mount on Express
app.use('/connector', createExpressRouter(
  () => myConnector.getDiscovery(),
  (req) => myConnector.executeAction(req),
));`}
        </pre>
      </Section>
    </div>
  );
}

function AisSpecTab({ spec }: any) {
  if (!spec) return <div style={{ color: "#9fb0ff" }}>AIS spec not available.</div>;
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <span style={{ padding: "4px 12px", borderRadius: 6, background: "rgba(255,180,80,0.12)", color: "#ffb366", fontSize: 13, fontWeight: 700 }}>{spec.status}</span>
        <span style={{ color: "#9fb0ff", fontSize: 13 }}>v{spec.version} · Published {spec.publishedAt}</span>
      </div>
      {spec.sections?.map((section: any) => (
        <Section key={section.id} title={section.title}>
          {section.content?.map((line: string, i: number) => (
            <p key={i} style={{ color: "#c8d2ff", lineHeight: 1.7, fontSize: 14, margin: "4px 0" }}>
              {line.startsWith("  ") ? <span style={{ paddingLeft: 20 }}>{line.trim()}</span> : line}
            </p>
          ))}
        </Section>
      ))}
    </div>
  );
}

function SdksTab({ sdks }: any) {
  if (!sdks) return <div style={{ color: "#9fb0ff" }}>SDK info not available.</div>;
  const statusColors: Record<string, string> = { available: "#80e0a0", planned: "#66c4ff", beta: "#ffb366", draft: "#ffb366" };
  return (
    <div style={{ display: "grid", gap: 20 }}>
      {sdks.sdks?.map((sdk: any) => (
        <div key={sdk.language} style={{ padding: 20, borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{sdk.language}</div>
              <div style={{ color: "#c8d2ff", fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>{sdk.description}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ padding: "3px 10px", borderRadius: 6, background: `${statusColors[sdk.status] || "#9fb0ff"}15`, color: statusColors[sdk.status] || "#9fb0ff", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>{sdk.status}</span>
              {sdk.eta && <div style={{ color: "#9fb0ff", fontSize: 12, marginTop: 4 }}>ETA: {sdk.eta}</div>}
            </div>
          </div>
          {sdk.packageName && <div style={{ marginTop: 8, padding: "6px 12px", borderRadius: 6, background: "rgba(0,0,0,0.2)", color: "#9fb0ff", fontSize: 13, fontFamily: "monospace" }}>{sdk.packageName}</div>}
        </div>
      ))}
      <Section title="Sandbox Environment">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <p style={{ color: "#c8d2ff", margin: 0, lineHeight: 1.5 }}>{sdks.sandbox?.description}</p>
          <span style={{ padding: "3px 10px", borderRadius: 6, background: "rgba(255,180,80,0.12)", color: "#ffb366", fontSize: 12, fontWeight: 600, textTransform: "uppercase", whiteSpace: "nowrap" }}>ETA: {sdks.sandbox?.eta}</span>
        </div>
      </Section>
    </div>
  );
}

function WebhooksTab({ webhooks }: any) {
  if (!webhooks) return <div style={{ color: "#9fb0ff" }}>Webhook docs not available.</div>;
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Section title="Standard">
        <div style={{ padding: "8px 14px", borderRadius: 8, background: "rgba(0,0,0,0.2)", color: "#9fb0ff", fontSize: 13, fontFamily: "monospace", display: "inline-block" }}>{webhooks.standard}</div>
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {webhooks.features?.map((f: string, i: number) => (
            <div key={i} style={{ padding: "8px 14px", borderRadius: 8, background: "rgba(109,124,255,0.05)", border: "1px solid rgba(109,124,255,0.1)", color: "#c8d2ff", fontSize: 13 }}>✓ {f}</div>
          ))}
        </div>
      </Section>
      <Section title="Events">
        <div style={{ display: "grid", gap: 10 }}>
          {webhooks.events?.map((evt: any) => (
            <div key={evt.type} style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <strong style={{ fontFamily: "monospace", fontSize: 13 }}>{evt.type}</strong>
              <span style={{ color: "#c8d2ff", fontSize: 13 }}>{evt.description}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Payload Format">
        <pre style={{ background: "rgba(0,0,0,0.3)", padding: 16, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", color: "#c8d2ff", fontSize: 13 }}>
{JSON.stringify(webhooks.payloadFormat, null, 2)}</pre>
      </Section>
    </div>
  );
}

function ApiTab() {
  const [phases, setPhases] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/developer/docs?phase=1`).then((r) => r.json()).catch(() => []),
      fetch(`${API_BASE}/developer/docs?phase=2`).then((r) => r.json()).catch(() => []),
    ]).then(([p1, p2]) => {
      setPhases({ phase1: p1, phase2: p2 });
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ color: "#9fb0ff" }}>Loading API docs...</div>;
  const methodColors: Record<string, string> = { GET: "#80e0a0", POST: "#66c4ff", PUT: "#ffb366", DELETE: "#ff8080" };
  const allDocs = [...(phases.phase1 || []), ...(phases.phase2 || [])];

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ color: "#9fb0ff", fontSize: 13, marginBottom: 8 }}>{allDocs.length} endpoints</div>
      {allDocs.map((doc: any) => (
        <div key={doc.path} style={{ padding: "10px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ padding: "2px 8px", borderRadius: 4, background: `${methodColors[doc.method] || "#9fb0ff"}15`, color: methodColors[doc.method] || "#9fb0ff", fontSize: 11, fontWeight: 700, fontFamily: "monospace", minWidth: 40, textAlign: "center" }}>{doc.method}</span>
          <span style={{ fontFamily: "monospace", fontSize: 13, flex: 1 }}>{doc.path}</span>
          <span style={{ color: "#c8d2ff", fontSize: 13 }}>{doc.description}</span>
          <span style={{ color: doc.auth ? "#ffb366" : "#80e0a0", fontSize: 11, fontWeight: 600 }}>{doc.auth ? "🔐 Auth" : "🔓 Public"}</span>
        </div>
      ))}
    </div>
  );
}

function RoadmapTab({ roadmap, certification }: any) {
  const statusColors: Record<string, string> = { done: "#80e0a0", draft: "#ffb366", planned: "#66c4ff" };
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Section title="Development Roadmap">
        <div style={{ display: "grid", gap: 10 }}>
          {roadmap?.roadmap?.map((item: any) => (
            <div key={item.item} style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <span style={{ color: "#9fb0ff", fontSize: 12, marginRight: 8 }}>Phase {item.phase}</span>
                <strong>{item.item}</strong>
              </div>
              <span style={{ padding: "3px 10px", borderRadius: 6, background: `${statusColors[item.status] || "#9fb0ff"}15`, color: statusColors[item.status] || "#9fb0ff", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>{item.status}</span>
            </div>
          ))}
        </div>
      </Section>

      {certification && (
        <Section title="Connector Certification Checklist">
          <div style={{ display: "grid", gap: 8 }}>
            {certification.checklist?.map((item: any) => (
              <div key={item.id} style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: "#c8d2ff", fontSize: 13 }}>{item.name}</span>
                <span style={{ color: item.required ? "#ffb366" : "#9fb0ff", fontSize: 12, fontWeight: 600 }}>{item.required ? "Required" : "Optional"}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Shared Components ───────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{title}</h2>
      {children}
    </div>
  );
}

function QuickLink({ icon, title, desc, href }: { icon: string; title: string; desc: string; href: string }) {
  return (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener" : undefined} style={{
      padding: 18, borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
      textDecoration: "none", color: "inherit", transition: "border-color 0.15s",
    }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
      <div style={{ color: "#c8d2ff", fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>{desc}</div>
    </a>
  );
}
