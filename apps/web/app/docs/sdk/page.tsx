"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../../../lib/auth";

// ── Types ───────────────────────────────────────────────────────────────

type ConnectorDoc = {
  key: string;
  name: string;
  version: string;
  description: string;
  category: string;
  docsUrl: string;
  actions: ActionDoc[];
  authMethods: string[];
  samplePayload: Record<string, any>;
};

type ActionDoc = {
  key: string;
  name: string;
  description: string;
  method: string;
  path: string;
  input: Record<string, any>;
  output: Record<string, any>;
};

// ── Code Snippet Component with Copy Button ────────────────────────────

function CodeBlock({
  code,
  language = "typescript",
  label,
}: {
  code: string;
  language?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent fallback */ }
  }, [code]);

  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.35)",
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <span style={{ fontSize: 11, color: "#9fb0ff", fontWeight: 500 }}>
          {label || language}
        </span>
        <button
          onClick={handleCopy}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.08)",
            background: copied ? "rgba(74,222,128,0.1)" : "transparent",
            color: copied ? "#4ade80" : "#9fb0ff",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500,
            transition: "all 0.15s",
          }}
        >
          {copied ? "✓ Copied!" : "📋 Copy"}
        </button>
      </div>

      {/* Code content */}
      <pre
        style={{
          padding: 16,
          margin: 0,
          color: "#c8d2ff",
          fontSize: 13,
          lineHeight: 1.6,
          overflowX: "auto",
          fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Copy snippet generators ────────────────────────────────────────────

function buildJsSnippet(connector: ConnectorDoc, action?: ActionDoc): string {
  const actionKey = action?.key || "get_info";
  const actionName = action?.name || "Get Connector Info";
  const inputExample = action?.input
    ? JSON.stringify(
        Object.fromEntries(
          Object.entries(action.input).map(([k, v]) => [k, v === "string" ? "your_value" : v === "number" ? 0 : v === "boolean" ? true : v])
        ),
        null,
        2,
      )
    : "{}";

  return `import { AisConnector } from '@aifut/connector-sdk';

// ── Initialize the ${connector.name} connector ──
const connector = new AisConnector({
  name: '${connector.name}',
  version: '${connector.version}',
  auth: {
    method: '${connector.authMethods[0] || "api_key"}',
    credentials: {
      // Get these from your AIFUT dashboard → Connectors → ${connector.key}
      apiKey: process.env.AIFUT_${connector.key.toUpperCase().replace(/-/g, "_")}_API_KEY,
      baseUrl: process.env.AIFUT_${connector.key.toUpperCase().replace(/-/g, "_")}_BASE_URL,
    },
  },
});

// ── Execute "${actionName}" ──
async function run() {
  const result = await connector.execute('${actionKey}', ${inputExample});
  console.log('Result:', result);
}

run().catch(console.error);`;
}

function buildTsSnippet(connector: ConnectorDoc, action?: ActionDoc): string {
  const actionKey = action?.key || "get_info";
  const actionName = action?.name || "Get Connector Info";
  const inputExample = action?.input
    ? JSON.stringify(
        Object.fromEntries(
          Object.entries(action.input).map(([k, v]) => [k, v === "string" ? "your_value" : v === "number" ? 0 : v === "boolean" ? true : v])
        ),
        null,
        2,
      )
    : "{}";

  return `import { AisConnector } from '@aifut/connector-sdk';
import type { ActionResponse } from '@aifut/connector-sdk';

// ── Type-safe ${connector.name} client ──
const connector = new AisConnector({
  name: '${connector.name}',
  version: '${connector.version}',
  auth: {
    method: '${connector.authMethods[0] || "api_key"}',
    credentials: {
      apiKey: process.env.AIFUT_${connector.key.toUpperCase().replace(/-/g, "_")}_API_KEY!,
      baseUrl: process.env.AIFUT_${connector.key.toUpperCase().replace(/-/g, "_")}_BASE_URL!,
    },
  },
});

// ── Execute "${actionName}" with full typing ──
async function run(): Promise<ActionResponse> {
  const result = await connector.execute<typeof ${actionKey}Output>('${actionKey}', ${inputExample});
  return result;
}

// ── Type for the action output (auto-derived from AIS spec) ──
type ${actionKey.charAt(0).toUpperCase() + actionKey.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}Output = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
};

run()
  .then((res) => console.log('✅ Success:', res.data))
  .catch((err) => console.error('❌ Failed:', err));`;
}

function buildCurlSnippet(connector: ConnectorDoc, action?: ActionDoc): string {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "https://api.aifut.io";
  const actionKey = action?.key || "get_info";
  const method = action?.method || "POST";
  const inputExample = action?.input
    ? JSON.stringify(
        Object.fromEntries(
          Object.entries(action.input).map(([k, v]) => [k, v === "string" ? "your_value" : v === "number" ? 0 : v === "boolean" ? true : v])
        ),
        null,
        2,
      )
    : "{}";

  return `# ── Call ${connector.name} connector via AIS REST API ──
# Requires an AIFUT API key (Settings → API Keys)

curl -X ${method} "${apiBase}/connectors/${connector.key}/${actionKey}" \\
  -H "Authorization: Bearer $AIFUT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "X-Tenant-Slug: your-tenant-slug" \\
  -d '${inputExample.replace(/\n/g, "\n")}'`;
}

function buildPythonSnippet(connector: ConnectorDoc, action?: ActionDoc): string {
  const actionKey = action?.key || "get_info";
  const actionName = action?.name || "Get Connector Info";
  const inputExample = action?.input
    ? JSON.stringify(
        Object.fromEntries(
          Object.entries(action.input).map(([k, v]) => [k, v === "string" ? "your_value" : v === "number" ? 0 : v === "boolean" ? true : v])
        ),
        null,
        2,
      )
    : "{}";

  return `from aifut_connector_sdk import AisConnector

# ── Initialize the ${connector.name} connector ──
connector = AisConnector(
    name="${connector.name}",
    version="${connector.version}",
    auth={
        "method": ${JSON.stringify(connector.authMethods[0] || "api_key")},
  api_key: "process.env.AIFUT_" + connector.key.toUpperCase().replaceAll("-", "_") + "_API_KEY",
  base_url: "process.env.AIFUT_" + connector.key.toUpperCase().replaceAll("-", "_") + "_BASE_URL",

        },
    },
)

# ── Execute "${actionName}" ──
result = connector.execute("${actionKey}", ${inputExample})
print("Result:", result)`;
}

// ── SDK Documentation Content Sections ──────────────────────────────────

const GETTING_STARTED_TS = `import { AisConnector } from '@aifut/connector-sdk';

// 1. Create a connector instance
const connector = new AisConnector({
  name: 'MyCRM',
  version: '1.0.0',
  auth: {
    method: 'api_key',
    credentials: {
      apiKey: process.env.AIFUT_MYCRM_API_KEY,
      baseUrl: process.env.AIFUT_MYCRM_BASE_URL,
    },
  },
});

// 2. Discover available actions
const discovery = await connector.discover();
console.log('Available actions:', discovery.actions);

// 3. Execute an action
const result = await connector.execute('create_contact', {
  name: 'John Doe',
  email: 'john@example.com',
});
console.log('Created:', result);`;

const GETTING_STARTED_PY = `from aifut_connector_sdk import AisConnector

connector = AisConnector(
    name="MyCRM",
    version="1.0.0",
    auth={
        "method": "api_key",
        "credentials": {
            "api_key": os.environ["AIFUT_MYCRM_API_KEY"],
            "base_url": os.environ["AIFUT_MYCRM_BASE_URL"],
        },
    },
)

discovery = connector.discover()
action_result = connector.execute("create_contact", {
    "name": "John Doe",
    "email": "john@example.com",
})
print(action_result)`;

const GETTING_STARTED_CURL = `# List all available connectors
curl https://api.aifut.io/connectors \\
  -H "Authorization: Bearer $AIFUT_API_KEY"

# Get connector discovery spec
curl https://api.aifut.io/connectors/my-crm/discovery \\
  -H "Authorization: Bearer $AIFUT_API_KEY"

# Execute an action
curl -X POST https://api.aifut.io/connectors/my-crm/execute \\
  -H "Authorization: Bearer $AIFUT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"action": "create_contact", "input": {"name": "John", "email": "john@example.com"}}'`;

const ENV_CONFIG = `# ── Required Environment Variables ──
# Set these in .env.local or your deployment environment.
# Each connector prefix follows: AIFUT_<CONNECTOR_KEY>_<VAR>

# AIFUT API access
AIFUT_API_KEY=your_api_key_here
AIFUT_API_BASE=https://api.aifut.io

# Connector-specific examples:
AIFUT_MYCRM_API_KEY=crm_api_key_here
AIFUT_MYCRM_BASE_URL=https://mycrm.example.com/api
AIFUT_SHOPIFY_API_KEY=shopify_token_here
AIFUT_SHOPIFY_BASE_URL=https://your-store.myshopify.com/admin/api/2024-01
AIFUT_VNPAY_TMN_CODE=YOUR_TMN_CODE
AIFUT_VNPAY_SECRET_HASH=your_secret_key`;

const CONNECTOR_DISCOVERY = `// AIS Discovery endpoint — every connector exposes this
GET /connector/discovery

// Response shape:
{
  "aisVersion": "1.0",
  "connectorName": "MyCRM",
  "connectorVersion": "1.0.0",
  "capabilities": {
    "read": true,
    "write": true,
    "webhook": false,
    "batch": false,
    "search": true
  },
  "actions": [
    {
      "key": "create_contact",
      "name": "Create Contact",
      "description": "Create a new contact record",
      "input": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "description": "Full name" },
          "email": { "type": "string", "description": "Email address" }
        },
        "required": ["name", "email"]
      }
    }
  ],
  "authMethods": ["api_key"],
  "rateLimits": {
    "requestsPerSecond": 10,
    "burstLimit": 20
  }
}`;

const WEBHOOK_SETUP_TS = `import { AisConnector } from '@aifut/connector-sdk';

const connector = new AisConnector({
  name: 'MyCRM',
  version: '1.0.0',
  auth: { method: 'api_key', credentials: { apiKey: process.env.AIFUT_API_KEY } },
});

// Register webhook target for real-time events
await connector.registerWebhook({
  url: 'https://myapp.com/webhooks/aifut',
  events: ['contact.created', 'contact.updated'],
  secret: process.env.WEBHOOK_SECRET,
});

// The AIFUT platform will POST events to your webhook URL:
// {
//   "eventId": "uuid",
//   "eventType": "contact.created",
//   "occurredAt": "2026-06-17T00:00:00Z",
//   "data": { "id": "123", "name": "John Doe" }
// }`;

// ── Main Page ──────────────────────────────────────────────────────────

export default function SdkDocsPage() {
  const [connectors, setConnectors] = useState<ConnectorDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null);
  const [envCopied, setEnvCopied] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const activeConnector = connectors.find((c) => c.key === selectedConnector) ?? null;

  useEffect(() => {
    const load = async () => {
      try {
        // Attempt to load SDK docs from the API
        const res = await fetch(`${API_BASE}/developer/sdks`).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          // Map SDK data into connector docs if available
          if (data?.sdks) {
            const docs: ConnectorDoc[] = data.sdks
              .filter((s: any) => s.status === "available" || s.status === "beta")
              .map((s: any) => ({
                key: s.language.toLowerCase().replace(/[\s.]+/g, "-"),
                name: `${s.language} SDK`,
                version: s.version || "1.0.0",
                description: s.description || `Official SDK for ${s.language}`,
                category: "sdk",
                docsUrl: s.docsUrl || "#",
                actions: [],
                authMethods: ["api_key"],
                samplePayload: {},
              }));
            setConnectors(docs);
          }
        }
      } catch { /* use fallback */ }

      // Always include connector docs from known built-in connectors
      const builtInDocs: ConnectorDoc[] = [
        {
          key: "vnpay",
          name: "VNPay",
          version: "2.1.0",
          description: "Vietnam payment gateway connector: process transactions, check status, handle callbacks",
          category: "payment",
          docsUrl: "/docs/sdk/connector/vnpay",
          authMethods: ["api_key"],
          samplePayload: { amount: 100000, orderInfo: "Test order", returnUrl: "https://example.com/return" },
          actions: [
            { key: "create_payment", name: "Create Payment", description: "Initiate a payment request with VNPay", method: "POST", path: "/connectors/vnpay/create_payment", input: { amount: "number", orderInfo: "string", returnUrl: "string", locale: "string" }, output: { paymentUrl: "string", transactionId: "string" } },
            { key: "query_transaction", name: "Query Transaction", description: "Check the status of an existing transaction", method: "GET", path: "/connectors/vnpay/query_transaction", input: { transactionId: "string" }, output: { status: "string", amount: "number", paidAt: "string" } },
          ],
        },
        {
          key: "momo",
          name: "MoMo",
          version: "2.0.0",
          description: "MoMo e-wallet payment connector for Vietnam market",
          category: "payment",
          docsUrl: "/docs/sdk/connector/momo",
          authMethods: ["api_key"],
          samplePayload: { amount: 50000, orderId: "ORDER_001", partnerRefId: "REF_001" },
          actions: [
            { key: "create_payment", name: "Create Payment", description: "Create a MoMo payment request", method: "POST", path: "/connectors/momo/create_payment", input: { amount: "number", orderId: "string", partnerRefId: "string", extraData: "string" }, output: { payUrl: "string", orderId: "string" } },
            { key: "check_status", name: "Check Status", description: "Check payment status by order ID", method: "GET", path: "/connectors/momo/check_status", input: { orderId: "string" }, output: { status: "string", amount: "number", transId: "string" } },
          ],
        },
        {
          key: "shopify",
          name: "Shopify",
          version: "3.0.0",
          description: "Full e-commerce integration: orders, products, customers, inventory sync",
          category: "ecommerce",
          docsUrl: "/docs/sdk/connector/shopify",
          authMethods: ["oauth2"],
          samplePayload: { productId: "123456", title: "New Product", price: 29.99 },
          actions: [
            { key: "list_products", name: "List Products", description: "Retrieve all products from your Shopify store", method: "GET", path: "/connectors/shopify/list_products", input: { limit: "number", cursor: "string" }, output: { products: "array", totalCount: "number" } },
            { key: "create_order", name: "Create Order", description: "Create a new order in Shopify", method: "POST", path: "/connectors/shopify/create_order", input: { lineItems: "array", customerEmail: "string", shippingAddress: "object" }, output: { orderId: "string", orderNumber: "number", totalPrice: "number" } },
          ],
        },
        {
          key: "slack",
          name: "Slack",
          version: "1.3.0",
          description: "Team communication: send messages, manage channels, interactive notifications",
          category: "communication",
          docsUrl: "/docs/sdk/connector/slack",
          authMethods: ["oauth2"],
          samplePayload: { channel: "#general", text: "Hello from AIFUT!" },
          actions: [
            { key: "send_message", name: "Send Message", description: "Post a message to a Slack channel", method: "POST", path: "/connectors/slack/send_message", input: { channel: "string", text: "string", threadTs: "string" }, output: { ts: "string", channel: "string" } },
            { key: "list_channels", name: "List Channels", description: "Retrieve all accessible channels", method: "GET", path: "/connectors/slack/list_channels", input: { limit: "number", cursor: "string" }, output: { channels: "array" } },
          ],
        },
        {
          key: "woocommerce",
          name: "WooCommerce",
          version: "1.2.0",
          description: "WordPress e-commerce: products, orders, customers, webhooks",
          category: "ecommerce",
          docsUrl: "/docs/sdk/connector/woocommerce",
          authMethods: ["api_key"],
          samplePayload: { consumerKey: "ck_xxx", consumerSecret: "cs_xxx", siteUrl: "https://example.com" },
          actions: [
            { key: "list_orders", name: "List Orders", description: "Fetch orders from WooCommerce", method: "GET", path: "/connectors/woocommerce/list_orders", input: { status: "string", perPage: "number", page: "number" }, output: { orders: "array", totalCount: "number" } },
            { key: "create_product", name: "Create Product", description: "Add a new product to WooCommerce", method: "POST", path: "/connectors/woocommerce/create_product", input: { name: "string", regularPrice: "string", description: "string", categories: "array" }, output: { productId: "number", permalink: "string" } },
          ],
        },
      ];
      setConnectors((prev) => [...prev, ...builtInDocs]);
      setLoading(false);
    };
    load();
  }, []);

  // Scroll to detail when a connector is selected
  useEffect(() => {
    if (activeConnector && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeConnector]);

  const copyEnv = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(ENV_CONFIG);
      setEnvCopied(true);
      setTimeout(() => setEnvCopied(false), 2000);
    } catch { /* ignore */ }
  }, []);

  const connectorGroups = connectors.reduce<Record<string, ConnectorDoc[]>>((acc, c) => {
    const group = c.category || "other";
    if (!acc[group]) acc[group] = [];
    acc[group].push(c);
    return acc;
  }, {});

  // ── Render ──────────────────────────────────────────────────────
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b1020",
        color: "#f5f7ff",
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "24px 32px",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div
            style={{
              fontSize: 12,
              color: "#9fb0ff",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 4,
            }}
          >
            AIFUT SDK Documentation
          </div>
          <h1 style={{ fontSize: 32, margin: 0 }}>SDK & Connector Docs</h1>
          <p style={{ color: "#c8d2ff", fontSize: 15, marginTop: 4 }}>
            AIS-compliant SDK reference, environment configuration, code snippets
            in TypeScript / JavaScript / cURL, and per-connector API documentation.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 32 }}>
        {/* ── Section 1: Quick Start ── */}
        <Section id="quickstart" title="⚡ Quick Start">
          <p style={{ color: "#c8d2ff", lineHeight: 1.7, marginBottom: 16 }}>
            Install the AIFUT Connector SDK from npm, then initialize a connector
            with your tenant credentials. All connectors expose a uniform
            <code style={{ color: "#66c4ff", background: "rgba(102,196,255,0.1)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}> discover - execute</code> interface.
          </p>

          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: "rgba(255,180,80,0.12)",
                  color: "#ffb366",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                npm
              </span>
              <code
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  background: "rgba(0,0,0,0.3)",
                  color: "#c8d2ff",
                  fontSize: 13,
                }}
              >
                npm install @aifut/connector-sdk
              </code>
              <span style={{ color: "#8899cc", fontSize: 13 }}>or</span>
              <code
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  background: "rgba(0,0,0,0.3)",
                  color: "#c8d2ff",
                  fontSize: 13,
                }}
              >
                pip install aifut-connector-sdk
              </code>
            </div>
          </div>

          {/* Tab switcher for language */}
          <SdkTabs
            tabs={[
              { id: "ts", label: "TypeScript" },
              { id: "py", label: "Python" },
              { id: "curl", label: "cURL" },
            ]}
            defaultTab="ts"
            renderContent={(tab) => {
              if (tab === "ts") return <CodeBlock code={GETTING_STARTED_TS} language="typescript" label="TypeScript" />;
              if (tab === "py") return <CodeBlock code={GETTING_STARTED_PY} language="python" label="Python" />;
              return <CodeBlock code={GETTING_STARTED_CURL} language="bash" label="Shell / cURL" />;
            }}
          />
        </Section>

        {/* ── Section 2: Environment Configuration ── */}
        <Section id="env" title="🔐 Environment Configuration">
          <p style={{ color: "#c8d2ff", lineHeight: 1.7, marginBottom: 12 }}>
            Set the following environment variables in your deployment. Each connector
            uses a prefix pattern &mdash; replace
            <code style={{ color: "#66c4ff", background: "rgba(102,196,255,0.1)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}> MYCRM</code> with your connector&apos;s key.
          </p>
          <CodeBlock code={ENV_CONFIG} language="bash" label=".env.local" />
          <button
            onClick={copyEnv}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "1px solid rgba(109,124,255,0.3)",
              background: envCopied ? "rgba(74,222,128,0.1)" : "rgba(109,124,255,0.1)",
              color: envCopied ? "#4ade80" : "#6d7cff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              transition: "all 0.15s",
            }}
          >
            {envCopied ? "✓ Copied!" : "📋 Copy All Env Vars"}
          </button>
        </Section>

        {/* ── Section 3: Connector Docs ── */}
        <Section id="connectors" title="🔌 Available Connectors">
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9fb0ff" }}>Loading connectors...</div>
          ) : (
            <>
              {Object.entries(connectorGroups).map(([group, items]) => (
                <div key={group} style={{ marginBottom: 24 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#9fb0ff",
                      textTransform: "capitalize",
                      marginBottom: 12,
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      paddingBottom: 8,
                    }}
                  >
                    {group}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    {items.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => setSelectedConnector(c.key)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "14px 18px",
                          borderRadius: 12,
                          border:
                            selectedConnector === c.key
                              ? "1px solid rgba(109,124,255,0.4)"
                              : "1px solid rgba(255,255,255,0.06)",
                          background:
                            selectedConnector === c.key
                              ? "rgba(109,124,255,0.08)"
                              : "rgba(255,255,255,0.02)",
                          color: "inherit",
                          cursor: "pointer",
                          textAlign: "left",
                          width: "100%",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "rgba(109,124,255,0.3)";
                          e.currentTarget.style.background = "rgba(109,124,255,0.05)";
                        }}
                        onMouseLeave={(e) => {
                          if (selectedConnector !== c.key) {
                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                            e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                          }
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                          <div
                            style={{
                              color: "#c8d2ff",
                              fontSize: 13,
                              marginTop: 2,
                            }}
                          >
                            {c.description?.slice(0, 80)}
                            {(c.description?.length ?? 0) > 80 ? "…" : ""}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", fontSize: 12, color: "#8899cc", whiteSpace: "nowrap" }}>
                          v{c.version}
                          <span style={{ marginLeft: 8 }}>
                            {c.authMethods.includes("oauth2") ? "🔐 OAuth2" : "🔑 API Key"}
                          </span>
                          <div style={{ fontSize: 11, color: "#6d7cff", marginTop: 2 }}>
                            {c.actions.length} action{c.actions.length !== 1 ? "s" : ""} →
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </Section>

        {/* ── Section 4: Active Connector Detail ── */}
        {activeConnector && (
          <div ref={detailRef}>
            <Section
              id={`detail-${activeConnector.key}`}
              title={`📖 ${activeConnector.name} — API Reference`}
            >
              {/* Overview */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>{activeConnector.name}</span>
                    <span
                      style={{
                        marginLeft: 8,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "rgba(74,222,128,0.1)",
                        color: "#4ade80",
                        border: "1px solid rgba(74,222,128,0.2)",
                        fontSize: 11,
                      }}
                    >
                      v{activeConnector.version}
                    </span>
                  </div>
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 6,
                      background:
                        activeConnector.authMethods.includes("oauth2")
                          ? "rgba(255,180,80,0.12)"
                          : "rgba(102,196,255,0.12)",
                      color:
                        activeConnector.authMethods.includes("oauth2")
                          ? "#ffb366"
                          : "#66c4ff",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {activeConnector.authMethods.includes("oauth2") ? "🔐 OAuth2" : "🔑 API Key"}
                  </span>
                </div>
                <p style={{ color: "#c8d2ff", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                  {activeConnector.description}
                </p>
              </div>

              {/* Code Snippets for this connector */}
              <h3
                style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#c8d2ff" }}
              >
                Code Samples
              </h3>

              <SdkTabs
                tabs={[
                  { id: "js", label: "JavaScript" },
                  { id: "ts", label: "TypeScript" },
                  { id: "curl", label: "cURL" },
                  { id: "py", label: "Python" },
                ]}
                defaultTab="ts"
                renderContent={(tab) => {
                  const firstAction = activeConnector.actions[0];
                  if (tab === "js")
                    return (
                      <CodeBlock
                        code={buildJsSnippet(activeConnector, firstAction)}
                        language="javascript"
                        label="JavaScript (Node.js)"
                      />
                    );
                  if (tab === "ts")
                    return (
                      <CodeBlock
                        code={buildTsSnippet(activeConnector, firstAction)}
                        language="typescript"
                        label="TypeScript"
                      />
                    );
                  if (tab === "curl")
                    return (
                      <CodeBlock
                        code={buildCurlSnippet(activeConnector, firstAction)}
                        language="bash"
                        label="Shell / cURL"
                      />
                    );
                  return (
                    <CodeBlock
                      code={buildPythonSnippet(activeConnector, firstAction)}
                      language="python"
                      label="Python"
                    />
                  );
                }}
              />

              {/* Actions Table */}
              {activeConnector.actions.length > 0 && (
                <>
                  <h3
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      marginBottom: 12,
                      marginTop: 24,
                      color: "#c8d2ff",
                    }}
                  >
                    Available Actions
                  </h3>
                  <div style={{ display: "grid", gap: 12 }}>
                    {activeConnector.actions.map((action) => (
                      <div
                        key={action.key}
                        style={{
                          padding: 14,
                          borderRadius: 12,
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 8,
                            marginBottom: 6,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: 4,
                                background:
                                  action.method === "GET"
                                    ? "rgba(128,224,160,0.12)"
                                    : "rgba(102,196,255,0.12)",
                                color:
                                  action.method === "GET" ? "#80e0a0" : "#66c4ff",
                                fontSize: 11,
                                fontWeight: 700,
                                fontFamily: "monospace",
                              }}
                            >
                              {action.method}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>
                              {action.name}
                            </span>
                          </div>
                          <code
                            style={{
                              fontSize: 12,
                              color: "#9fb0ff",
                              background: "rgba(0,0,0,0.2)",
                              padding: "4px 8px",
                              borderRadius: 6,
                            }}
                          >
                            {action.path}
                          </code>
                        </div>
                        <p
                          style={{
                            color: "#8899cc",
                            fontSize: 13,
                            margin: "4px 0 8px",
                          }}
                        >
                          {action.description}
                        </p>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 12,
                            fontSize: 12,
                          }}
                        >
                          <div>
                            <span style={{ color: "#9fb0ff", fontWeight: 600 }}>
                              Input
                            </span>
                            <pre
                              style={{
                                background: "rgba(0,0,0,0.2)",
                                padding: 8,
                                borderRadius: 6,
                                color: "#c8d2ff",
                                fontSize: 11,
                                marginTop: 4,
                                overflowX: "auto",
                              }}
                            >
                              {JSON.stringify(action.input, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <span style={{ color: "#9fb0ff", fontWeight: 600 }}>
                              Output
                            </span>
                            <pre
                              style={{
                                background: "rgba(0,0,0,0.2)",
                                padding: 8,
                                borderRadius: 6,
                                color: "#c8d2ff",
                                fontSize: 11,
                                marginTop: 4,
                                overflowX: "auto",
                              }}
                            >
                              {JSON.stringify(action.output, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Section>
          </div>
        )}

        {/* ── Section 5: AIS Discovery ── */}
        <Section id="ais-discovery" title="📋 AIS Discovery Protocol">
          <p style={{ color: "#c8d2ff", lineHeight: 1.7, marginBottom: 12 }}>
            Every AIS-compliant connector exposes a <code style={{ color: "#66c4ff", background: "rgba(102,196,255,0.1)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>GET /connector/discovery</code> endpoint.
            This lets AIFUT workflows discover available actions, input/output schemas,
            auth methods, and rate limits at runtime.
          </p>
          <CodeBlock code={CONNECTOR_DISCOVERY} language="json" label="AIS Discovery Response" />
        </Section>

        {/* ── Section 6: Webhook Setup ── */}
        <Section id="webhooks" title="🔌 Webhook Integration">
          <p style={{ color: "#c8d2ff", lineHeight: 1.7, marginBottom: 12 }}>
            Connectors can push real-time events to your application via webhooks.
            Register a target URL for the events you want to receive. AIFUT signs
            webhooks with a shared secret for verification.
          </p>
          <CodeBlock code={WEBHOOK_SETUP_TS} language="typescript" label="TypeScript — Webhook Registration" />
          <div
            style={{
              marginTop: 12,
              padding: "8px 14px",
              borderRadius: 8,
              background: "rgba(255,180,80,0.08)",
              border: "1px solid rgba(255,180,80,0.15)",
              color: "#ffb366",
              fontSize: 13,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <span style={{ fontSize: 16 }}>💡</span>
            <span>Verify webhook signatures using the <code style={{ background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: 4 }}>aifut-verify-webhook</code> utility from the SDK. Replay protection via <code style={{ background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: 4 }}>eventId</code> deduplication.</span>
          </div>
        </Section>
      </div>

      {/* Footer */}
      <footer
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "24px 32px 48px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          color: "#9fb0ff",
          fontSize: 13,
        }}
      >
        <div>© 2026 AIFUT — SDK Documentation</div>
        <div style={{ display: "flex", gap: 16 }}>
          <a href="/developer" style={{ color: "#9fb0ff", textDecoration: "none" }}>
            Developer Portal
          </a>
          <a href="/foundation" style={{ color: "#9fb0ff", textDecoration: "none" }}>
            Foundation
          </a>
          <a href="/marketplace" style={{ color: "#9fb0ff", textDecoration: "none" }}>
            Marketplace
          </a>
        </div>
      </footer>
    </main>
  );
}

// ── Section Component ──────────────────────────────────────────────────

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} style={{ marginBottom: 40 }}>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 16,
          paddingBottom: 8,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── SDK Tab Switcher ───────────────────────────────────────────────────

function SdkTabs({
  tabs,
  defaultTab,
  renderContent,
}: {
  tabs: { id: string; label: string }[];
  defaultTab: string;
  renderContent: (tab: string) => React.ReactNode;
}) {
  const [active, setActive] = useState(defaultTab);

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 12,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            style={{
              padding: "8px 16px",
              borderRadius: 0,
              border: "none",
              borderBottom:
                active === tab.id ? "2px solid #6d7cff" : "2px solid transparent",
              background: "transparent",
              color: active === tab.id ? "#6d7cff" : "#9fb0ff",
              fontWeight: active === tab.id ? 700 : 400,
              cursor: "pointer",
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {renderContent(active)}
    </div>
  );
}
