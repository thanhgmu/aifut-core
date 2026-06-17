"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { API_BASE } from "../../../../../lib/auth";

// ── Types ───────────────────────────────────────────────────────────────

type ActionDoc = {
  key: string;
  name: string;
  description: string;
  method: string;
  path: string;
  input: Record<string, any>;
  output: Record<string, any>;
};

type ConnectorDoc = {
  key: string;
  name: string;
  version: string;
  description: string;
  category: string;
  docsUrl: string;
  authMethods: string[];
  samplePayload: Record<string, any>;
  actions: ActionDoc[];
  /** Optional extended detail fields */
  baseUrl?: string;
  endpoints?: { path: string; method: string; description: string }[];
  envVars?: { key: string; description: string; required: boolean }[];
  webhookEvents?: { type: string; description: string }[];
};

// ── Env key helpers (pure, NOT used in static const) ──────────────────

function envKey(name: string): string {
  return `AIFUT_${name.toUpperCase().replace(/-/g, "_")}`;
}

// ── Built-in Connector Database ────────────────────────────────────────

const CONNECTOR_DB: Record<string, ConnectorDoc> = {
  vnpay: {
    key: "vnpay",
    name: "VNPay",
    version: "2.1.0",
    description:
      "Vietnam payment gateway connector. Supports VNPay Standard, QuickPay, QR Code, and Wallet. Handles payment creation, transaction query, IPN callbacks, and refund flows with full hash verification.",
    category: "payment",
    docsUrl: "/docs/sdk/connector/vnpay",
    authMethods: ["api_key"],
    samplePayload: { amount: 100000, orderInfo: "Test order", returnUrl: "https://example.com/return" },
    baseUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
    envVars: [
      { key: "AIFUT_VNPAY_TMN_CODE", description: "VNPay merchant TMN code", required: true },
      { key: "AIFUT_VNPAY_SECRET_HASH", description: "VNPay secret hash key", required: true },
      { key: "AIFUT_VNPAY_RETURN_URL", description: "Callback URL after payment", required: true },
    ],
    webhookEvents: [
      { type: "payment.success", description: "Payment completed successfully" },
      { type: "payment.failed", description: "Payment failed or was rejected" },
      { type: "payment.refunded", description: "Transaction was refunded" },
    ],
    actions: [
      {
        key: "create_payment",
        name: "Create Payment",
        description: "Initiate a VNPay payment request. Returns a redirect URL to VNPay's payment gateway.",
        method: "POST",
        path: "/connectors/vnpay/create_payment",
        input: {
          amount: "number",
          orderInfo: "string",
          returnUrl: "string",
          locale: "string",
          bankCode: "string",
          orderType: "string",
        },
        output: { paymentUrl: "string", transactionId: "string", checksum: "string" },
      },
      {
        key: "query_transaction",
        name: "Query Transaction",
        description: "Query VNPay for the status of an existing transaction by transaction ID.",
        method: "GET",
        path: "/connectors/vnpay/query_transaction",
        input: { transactionId: "string", createDate: "string" },
        output: {
          status: "string",
          amount: "number",
          paidAt: "string",
          bankCode: "string",
          cardType: "string",
        },
      },
      {
        key: "refund",
        name: "Refund Transaction",
        description: "Process a full or partial refund on a completed transaction.",
        method: "POST",
        path: "/connectors/vnpay/refund",
        input: { transactionId: "string", amount: "number", reason: "string" },
        output: { refundId: "string", status: "string", refundedAt: "string" },
      },
      {
        key: "verify_ipn",
        name: "Verify IPN Callback",
        description: "Verify the integrity of an incoming VNPay IPN (Instant Payment Notification) callback.",
        method: "POST",
        path: "/connectors/vnpay/verify_ipn",
        input: { vnpParams: "object" },
        output: { verified: "boolean", status: "string", orderId: "string" },
      },
    ],
    endpoints: [
      { path: "/connectors/vnpay/create_payment", method: "POST", description: "Initiate payment" },
      { path: "/connectors/vnpay/query_transaction", method: "GET", description: "Check transaction status" },
      { path: "/connectors/vnpay/refund", method: "POST", description: "Process refund" },
      { path: "/connectors/vnpay/verify_ipn", method: "POST", description: "Verify IPN callback" },
      { path: "/connectors/vnpay/discovery", method: "GET", description: "AIS discovery spec" },
    ],
  },
  momo: {
    key: "momo",
    name: "MoMo",
    version: "2.0.0",
    description:
      "MoMo e-wallet payment gateway connector for Vietnam. Supports payment capture, status queries, refunds, and multi-language responses.",
    category: "payment",
    docsUrl: "/docs/sdk/connector/momo",
    authMethods: ["api_key"],
    samplePayload: { amount: 50000, orderId: "ORDER_001", partnerRefId: "REF_001" },
    baseUrl: "https://test-payment.momo.vn/v2/gateway/api",
    envVars: [
      { key: "AIFUT_MOMO_PARTNER_CODE", description: "MoMo partner code", required: true },
      { key: "AIFUT_MOMO_ACCESS_KEY", description: "MoMo API access key", required: true },
      { key: "AIFUT_MOMO_SECRET_KEY", description: "MoMo API secret key", required: true },
    ],
    webhookEvents: [
      { type: "payment.success", description: "Payment completed" },
      { type: "payment.failed", description: "Payment failed" },
      { type: "payment.cancelled", description: "User cancelled payment" },
    ],
    actions: [
      {
        key: "create_payment",
        name: "Create Payment",
        description: "Create a MoMo payment request. Returns a payment URL for redirect.",
        method: "POST",
        path: "/connectors/momo/create_payment",
        input: { amount: "number", orderId: "string", partnerRefId: "string", extraData: "string" },
        output: { payUrl: "string", orderId: "string", requestId: "string" },
      },
      {
        key: "check_status",
        name: "Check Status",
        description: "Query payment status by order ID.",
        method: "GET",
        path: "/connectors/momo/check_status",
        input: { orderId: "string" },
        output: { status: "string", amount: "number", transId: "string", message: "string" },
      },
      {
        key: "refund",
        name: "Refund",
        description: "Refund a completed MoMo transaction.",
        method: "POST",
        path: "/connectors/momo/refund",
        input: { orderId: "string", transId: "string", amount: "number", description: "string" },
        output: { refundId: "string", status: "string" },
      },
    ],
    endpoints: [
      { path: "/connectors/momo/create_payment", method: "POST", description: "Create payment request" },
      { path: "/connectors/momo/check_status", method: "GET", description: "Check payment status" },
      { path: "/connectors/momo/refund", method: "POST", description: "Process refund" },
      { path: "/connectors/momo/discovery", method: "GET", description: "AIS discovery spec" },
    ],
  },
  shopify: {
    key: "shopify",
    name: "Shopify",
    version: "3.0.0",
    description:
      "Full e-commerce integration. Manage orders, products, customers, inventory, and webhooks. OAuth2-authenticated with support for Shopify's GraphQL Admin API.",
    category: "ecommerce",
    docsUrl: "/docs/sdk/connector/shopify",
    authMethods: ["oauth2"],
    samplePayload: { productId: "123456", title: "New Product", price: 29.99 },
    baseUrl: "https://{store}.myshopify.com/admin/api/2024-01",
    envVars: [
      { key: "AIFUT_SHOPIFY_STORE", description: "Your Shopify store domain (e.g. my-store)", required: true },
      { key: "AIFUT_SHOPIFY_ACCESS_TOKEN", description: "Shopify Admin API access token", required: true },
      { key: "AIFUT_SHOPIFY_API_VERSION", description: "Shopify API version (default 2024-01)", required: false },
    ],
    webhookEvents: [
      { type: "orders/create", description: "New order created" },
      { type: "orders/updated", description: "Order updated" },
      { type: "products/create", description: "New product added" },
      { type: "customers/create", description: "New customer registered" },
    ],
    actions: [
      {
        key: "list_products",
        name: "List Products",
        description: "Retrieve all products with pagination support.",
        method: "GET",
        path: "/connectors/shopify/list_products",
        input: { limit: "number", cursor: "string", status: "string" },
        output: { products: "array", totalCount: "number", nextCursor: "string" },
      },
      {
        key: "create_order",
        name: "Create Order",
        description: "Create a new order in Shopify with line items, customer info, and shipping.",
        method: "POST",
        path: "/connectors/shopify/create_order",
        input: {
          lineItems: "array",
          customerEmail: "string",
          shippingAddress: "object",
          financialStatus: "string",
        },
        output: { orderId: "string", orderNumber: "number", totalPrice: "number", createdAt: "string" },
      },
      {
        key: "get_customer",
        name: "Get Customer",
        description: "Fetch customer details by email or ID.",
        method: "GET",
        path: "/connectors/shopify/get_customer",
        input: { customerId: "string", email: "string" },
        output: { customer: "object", ordersCount: "number", totalSpent: "number" },
      },
    ],
    endpoints: [
      { path: "/connectors/shopify/list_products", method: "GET", description: "List products" },
      { path: "/connectors/shopify/create_order", method: "POST", description: "Create order" },
      { path: "/connectors/shopify/get_customer", method: "GET", description: "Get customer" },
      { path: "/connectors/shopify/discovery", method: "GET", description: "AIS discovery spec" },
    ],
  },
  slack: {
    key: "slack",
    name: "Slack",
    version: "1.3.0",
    description:
      "Team communication connector. Send messages, list channels, create channels, upload files, and receive interactive notifications through Slack Events API.",
    category: "communication",
    docsUrl: "/docs/sdk/connector/slack",
    authMethods: ["api_key"],
    samplePayload: { channel: "#general", text: "Hello from AIFUT!" },
    baseUrl: "https://slack.com/api",
    envVars: [
      { key: "AIFUT_SLACK_BOT_TOKEN", description: "Slack Bot User OAuth Token", required: true },
      { key: "AIFUT_SLACK_SIGNING_SECRET", description: "Slack signing secret for request verification", required: true },
    ],
    webhookEvents: [
      { type: "message.channels", description: "Message posted in a public channel" },
      { type: "message.groups", description: "Message posted in a private channel" },
      { type: "reaction_added", description: "Reaction added to a message" },
    ],
    actions: [
      {
        key: "send_message",
        name: "Send Message",
        description: "Post a message to a Slack channel. Supports Markdown formatting and thread replies.",
        method: "POST",
        path: "/connectors/slack/send_message",
        input: { channel: "string", text: "string", threadTs: "string", asUser: "boolean" },
        output: { ts: "string", channel: "string", message: "object" },
      },
      {
        key: "list_channels",
        name: "List Channels",
        description: "Retrieve all accessible public channels for the workspace.",
        method: "GET",
        path: "/connectors/slack/list_channels",
        input: { limit: "number", cursor: "string", excludeArchived: "boolean" },
        output: { channels: "array", nextCursor: "string" },
      },
      {
        key: "create_channel",
        name: "Create Channel",
        description: "Create a new public or private Slack channel.",
        method: "POST",
        path: "/connectors/slack/create_channel",
        input: { name: "string", isPrivate: "boolean", description: "string" },
        output: { channel: "object", id: "string" },
      },
    ],
    endpoints: [
      { path: "/connectors/slack/send_message", method: "POST", description: "Send a message" },
      { path: "/connectors/slack/list_channels", method: "GET", description: "List channels" },
      { path: "/connectors/slack/create_channel", method: "POST", description: "Create channel" },
      { path: "/connectors/slack/discovery", method: "GET", description: "AIS discovery spec" },
    ],
  },
  woocommerce: {
    key: "woocommerce",
    name: "WooCommerce",
    version: "1.2.0",
    description:
      "WordPress e-commerce connector. Manage products, orders, customers, and WooCommerce webhooks through the REST API.",
    category: "ecommerce",
    docsUrl: "/docs/sdk/connector/woocommerce",
    authMethods: ["api_key"],
    samplePayload: { consumerKey: "ck_xxx", consumerSecret: "cs_xxx", siteUrl: "https://example.com" },
    baseUrl: "https://{store-url}/wp-json/wc/v3",
    envVars: [
      { key: "AIFUT_WOOCOMMERCE_SITE_URL", description: "WooCommerce store base URL", required: true },
      { key: "AIFUT_WOOCOMMERCE_CONSUMER_KEY", description: "WooCommerce REST API consumer key", required: true },
      { key: "AIFUT_WOOCOMMERCE_CONSUMER_SECRET", description: "WooCommerce REST API consumer secret", required: true },
    ],
    webhookEvents: [
      { type: "order.created", description: "New WooCommerce order" },
      { type: "order.updated", description: "Order status changed" },
      { type: "product.created", description: "New product published" },
      { type: "customer.created", description: "New customer registered" },
    ],
    actions: [
      {
        key: "list_orders",
        name: "List Orders",
        description: "Fetch orders with status filter and pagination.",
        method: "GET",
        path: "/connectors/woocommerce/list_orders",
        input: { status: "string", perPage: "number", page: "number", after: "string" },
        output: { orders: "array", totalCount: "number", totalPages: "number" },
      },
      {
        key: "create_product",
        name: "Create Product",
        description: "Add a new product to WooCommerce with categories, images, and pricing.",
        method: "POST",
        path: "/connectors/woocommerce/create_product",
        input: {
          name: "string",
          regularPrice: "string",
          description: "string",
          categories: "array",
          images: "array",
          stockQuantity: "number",
        },
        output: { productId: "number", permalink: "string", dateCreated: "string" },
      },
      {
        key: "get_customer",
        name: "Get Customer",
        description: "Retrieve customer details by email or ID.",
        method: "GET",
        path: "/connectors/woocommerce/get_customer",
        input: { customerId: "number", email: "string" },
        output: { customer: "object", orders: "array" },
      },
    ],
    endpoints: [
      { path: "/connectors/woocommerce/list_orders", method: "GET", description: "List orders" },
      { path: "/connectors/woocommerce/create_product", method: "POST", description: "Create product" },
      { path: "/connectors/woocommerce/get_customer", method: "GET", description: "Get customer" },
      { path: "/connectors/woocommerce/discovery", method: "GET", description: "AIS discovery spec" },
    ],
  },
};

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
    } catch {
      /* silent */
    }
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

// ── Snippet Generators ─────────────────────────────────────────────────

function buildJsSnippet(connector: ConnectorDoc, action?: ActionDoc): string {
  const actionKey = action?.key || "get_info";
  const ek = envKey(connector.key);
  const inputExample = action?.input
    ? JSON.stringify(
        Object.fromEntries(
          Object.entries(action.input).map(([k, v]) => [
            k,
            v === "string"
              ? "your_value"
              : v === "number"
                ? 0
                : v === "boolean"
                  ? true
                  : v,
          ]),
        ),
        null,
        2,
      )
    : "{}";

  return `import { AisConnector } from '@aifut/connector-sdk';

const connector = new AisConnector({
  name: '${connector.name}',
  version: '${connector.version}',
  auth: {
    method: '${connector.authMethods[0] || "api_key"}',
    credentials: {
      apiKey: process.env.${ek}_API_KEY,
      baseUrl: process.env.${ek}_BASE_URL,
    },
  },
});

async function run() {
  const result = await connector.execute('${actionKey}', ${inputExample});
  console.log('Result:', result);
}

run().catch(console.error);`;
}

function buildTsSnippet(connector: ConnectorDoc, action?: ActionDoc): string {
  const actionKey = action?.key || "get_info";
  const ek = envKey(connector.key);
  const inputExample = action?.input
    ? JSON.stringify(
        Object.fromEntries(
          Object.entries(action.input).map(([k, v]) => [
            k,
            v === "string"
              ? "your_value"
              : v === "number"
                ? 0
                : v === "boolean"
                  ? true
                  : v,
          ]),
        ),
        null,
        2,
      )
    : "{}";

  return `import { AisConnector } from '@aifut/connector-sdk';
import type { ActionResponse } from '@aifut/connector-sdk';

const connector = new AisConnector({
  name: '${connector.name}',
  version: '${connector.version}',
  auth: {
    method: '${connector.authMethods[0] || "api_key"}',
    credentials: {
      apiKey: process.env.${ek}_API_KEY!,
      baseUrl: process.env.${ek}_BASE_URL!,
    },
  },
});

type ActionOutput = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
};

async function run(): Promise<ActionResponse> {
  return connector.execute('${actionKey}', ${inputExample});
}

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
          Object.entries(action.input).map(([k, v]) => [
            k,
            v === "string"
              ? "your_value"
              : v === "number"
                ? 0
                : v === "boolean"
                  ? true
                  : v,
          ]),
        ),
        null,
        2,
      )
    : "{}";

  return `# Requires AIFUT_API_KEY env var or pass directly
curl -X ${method} "${apiBase}/connectors/${connector.key}/${actionKey}" \\
  -H "Authorization: Bearer $AIFUT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "X-Tenant-Slug: your-tenant-slug" \\
  -d '${inputExample.replace(/\n/g, "\n")}'`;
}

function buildPythonSnippet(connector: ConnectorDoc, action?: ActionDoc): string {
  const actionKey = action?.key || "get_info";
  const ek = envKey(connector.key);

  return `import os
from aifut_connector_sdk import AisConnector

connector = AisConnector(
    name="${connector.name}",
    version="${connector.version}",
    auth={
        "api_key": os.environ.get("${ek}_API_KEY"),
        "base_url": os.environ.get("${ek}_BASE_URL"),
    },
)

result = connector.execute("${actionKey}", {
    # Fill with your input parameters
})
print("Result:", result)`;
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function ConnectorDocsPage() {
  const params = useParams();
  const key = params?.key as string;
  const detailRef = useRef<HTMLDivElement>(null);

  const [connector, setConnector] = useState<ConnectorDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Resolve connector data
  useEffect(() => {
    if (!key) return;

    // First try the local database
    const localDoc = CONNECTOR_DB[key];
    if (localDoc) {
      setConnector(localDoc);
      setActiveAction(localDoc.actions[0]?.key ?? null);
      setLoading(false);
      return;
    }

    // Fallback: try the API
    fetch(`${API_BASE}/developer/connectors/${key}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          const doc: ConnectorDoc = {
            key: data.key ?? key,
            name: data.name ?? key,
            version: data.version ?? "1.0.0",
            description: data.description ?? "",
            category: data.category ?? "other",
            docsUrl: data.docsUrl ?? `/docs/sdk/connector/${key}`,
            authMethods: data.authMethods ?? ["api_key"],
            samplePayload: data.samplePayload ?? {},
            actions: (data.actions ?? []).map((a: any) => ({
              key: a.key,
              name: a.name,
              description: a.description,
              method: a.method ?? "POST",
              path: a.path ?? `/connectors/${key}/${a.key}`,
              input: a.input ?? {},
              output: a.output ?? {},
            })),
            baseUrl: data.baseUrl,
            endpoints: data.endpoints,
            envVars: data.envVars,
            webhookEvents: data.webhookEvents,
          };
          setConnector(doc);
          setActiveAction(doc.actions[0]?.key ?? null);
        } else {
          setNotFound(true);
        }
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [key]);

  // Scroll to detail when loaded
  useEffect(() => {
    if (connector && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [connector]);

  const activeActionDef = connector?.actions.find((a) => a.key === activeAction) ?? null;

  // ── Render ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#0b1020",
          color: "#f5f7ff",
          fontFamily: "'Segoe UI', Arial, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔄</div>
          <div style={{ color: "#9fb0ff" }}>Loading connector documentation...</div>
        </div>
      </main>
    );
  }

  if (notFound || !connector) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#0b1020",
          color: "#f5f7ff",
          fontFamily: "'Segoe UI', Arial, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Connector Not Found</h1>
          <p style={{ color: "#8899cc", marginBottom: 20 }}>
            No documentation found for &ldquo;{key}&rdquo;.
          </p>
          <a
            href="/docs/sdk"
            style={{
              padding: "10px 24px",
              borderRadius: 10,
              background: "#6d7cff",
              color: "white",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            ← Back to SDK Docs
          </a>
        </div>
      </main>
    );
  }

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
          <a
            href="/docs/sdk"
            style={{
              color: "#9fb0ff",
              textDecoration: "none",
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 8,
            }}
          >
            ← SDK Documentation
          </a>
          <div
            style={{
              fontSize: 12,
              color: "#9fb0ff",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 4,
            }}
          >
            {connector.category} Connector
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h1 style={{ fontSize: 28, margin: 0 }}>{connector.name}</h1>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: 999,
                background: "rgba(74,222,128,0.1)",
                color: "#4ade80",
                border: "1px solid rgba(74,222,128,0.2)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              v{connector.version}
            </span>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: 6,
                background:
                  connector.authMethods.includes("oauth2")
                    ? "rgba(255,180,80,0.12)"
                    : "rgba(102,196,255,0.12)",
                color:
                  connector.authMethods.includes("oauth2") ? "#ffb366" : "#66c4ff",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {connector.authMethods.includes("oauth2") ? "🔐 OAuth2" : "🔑 API Key"}
            </span>
          </div>
          <p style={{ color: "#c8d2ff", fontSize: 15, marginTop: 6, maxWidth: 700 }}>
            {connector.description}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 32 }} ref={detailRef}>
        {/* ── Section 1: Environment Variables ── */}
        {connector.envVars && connector.envVars.length > 0 && (
          <Section title="🔐 Required Environment Variables">
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                marginBottom: 16,
              }}
            >
              {connector.baseUrl && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 12,
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "#9fb0ff" }}>Base URL:</span>
                  <code
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      background: "rgba(0,0,0,0.3)",
                      color: "#66c4ff",
                      fontSize: 13,
                    }}
                  >
                    {connector.baseUrl}
                  </code>
                </div>
              )}
              <div style={{ display: "grid", gap: 8 }}>
                {connector.envVars.map((v) => (
                  <div
                    key={v.key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "rgba(0,0,0,0.2)",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <code
                        style={{
                          color: v.required ? "#ffb366" : "#9fb0ff",
                          fontSize: 13,
                        }}
                      >
                        {v.key}
                      </code>
                      {v.required && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(255,180,80,0.12)",
                            color: "#ffb366",
                            fontWeight: 600,
                          }}
                        >
                          REQUIRED
                        </span>
                      )}
                    </div>
                    <span style={{ color: "#8899cc", fontSize: 13 }}>
                      {v.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* ── Section 2: Code Snippets ── */}
        <Section title="📦 Code Samples">
          {/* Use a state-based tab switcher inline */}
          <TabbedCode
            key={connector.key}
            connectorKey={connector.key}
            tabs={[
              { id: "js", label: "JavaScript", code: buildJsSnippet(connector, activeActionDef!) },
              { id: "ts", label: "TypeScript", code: buildTsSnippet(connector, activeActionDef!) },
              { id: "curl", label: "cURL", code: buildCurlSnippet(connector, activeActionDef!) },
              { id: "py", label: "Python", code: buildPythonSnippet(connector, activeActionDef!) },
            ]}
          />
        </Section>

        {/* ── Section 3: Actions Catalog ── */}
        <Section title="⚡ Available Actions">
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {connector.actions.map((action) => (
              <button
                key={action.key}
                onClick={() => setActiveAction(action.key)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: activeAction === action.key ? 700 : 400,
                  background:
                    activeAction === action.key ? "#6d7cff" : "transparent",
                  color:
                    activeAction === action.key ? "white" : "#9fb0ff",
                  borderColor:
                    activeAction === action.key
                      ? "#6d7cff"
                      : "rgba(255,255,255,0.15)",
                  transition: "all 0.15s",
                }}
              >
                {action.method === "GET" ? "📖" : "🚀"} {action.name}
              </button>
            ))}
          </div>

          {activeActionDef && (
            <div
              style={{
                padding: 20,
                borderRadius: 14,
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
                  marginBottom: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 4,
                      background:
                        activeActionDef.method === "GET"
                          ? "rgba(128,224,160,0.12)"
                          : "rgba(102,196,255,0.12)",
                      color:
                        activeActionDef.method === "GET"
                          ? "#80e0a0"
                          : "#66c4ff",
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: "monospace",
                    }}
                  >
                    {activeActionDef.method}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>
                    {activeActionDef.name}
                  </span>
                </div>
                <code
                  style={{
                    fontSize: 13,
                    color: "#9fb0ff",
                    background: "rgba(0,0,0,0.2)",
                    padding: "4px 10px",
                    borderRadius: 6,
                  }}
                >
                  {activeActionDef.path}
                </code>
              </div>
              <p
                style={{
                  color: "#c8d2ff",
                  fontSize: 14,
                  lineHeight: 1.6,
                  marginBottom: 16,
                }}
              >
                {activeActionDef.description}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#9fb0ff",
                      marginBottom: 8,
                    }}
                  >
                    Input Schema
                  </div>
                  <pre
                    style={{
                      background: "rgba(0,0,0,0.25)",
                      padding: 12,
                      borderRadius: 8,
                      color: "#c8d2ff",
                      fontSize: 12,
                      lineHeight: 1.5,
                      overflowX: "auto",
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(activeActionDef.input, null, 2)}
                  </pre>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#9fb0ff",
                      marginBottom: 8,
                    }}
                  >
                    Output Schema
                  </div>
                  <pre
                    style={{
                      background: "rgba(0,0,0,0.25)",
                      padding: 12,
                      borderRadius: 8,
                      color: "#c8d2ff",
                      fontSize: 12,
                      lineHeight: 1.5,
                      overflowX: "auto",
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(activeActionDef.output, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* ── Section 4: All Endpoints ── */}
        {connector.endpoints && connector.endpoints.length > 0 && (
          <Section title="🔌 All Endpoints">
            <div style={{ display: "grid", gap: 8 }}>
              {connector.endpoints.map((ep, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      background:
                        ep.method === "GET"
                          ? "rgba(128,224,160,0.12)"
                          : ep.method === "POST"
                            ? "rgba(102,196,255,0.12)"
                            : "rgba(255,180,80,0.12)",
                      color:
                        ep.method === "GET"
                          ? "#80e0a0"
                          : ep.method === "POST"
                            ? "#66c4ff"
                            : "#ffb366",
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "monospace",
                      minWidth: 40,
                      textAlign: "center",
                    }}
                  >
                    {ep.method}
                  </span>
                  <code
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: "#c8d2ff",
                    }}
                  >
                    {ep.path}
                  </code>
                  <span style={{ color: "#8899cc", fontSize: 13 }}>
                    {ep.description}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Section 5: Webhook Events ── */}
        {connector.webhookEvents && connector.webhookEvents.length > 0 && (
          <Section title="📡 Webhook Events">
            <p style={{ color: "#c8d2ff", fontSize: 14, marginBottom: 12 }}>
              This connector can push real-time events to your registered webhook URLs.
              Register webhooks via the AIFUT dashboard or the SDK.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {connector.webhookEvents.map((evt, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    flexWrap: "wrap",
                  }}
                >
                  <code
                    style={{
                      fontSize: 13,
                      color: "#66c4ff",
                      fontFamily: "monospace",
                    }}
                  >
                    {evt.type}
                  </code>
                  <span style={{ color: "#c8d2ff", fontSize: 13 }}>
                    {evt.description}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}
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
        <div>© 2026 AIFUT — {connector.name} Connector Docs</div>
        <div style={{ display: "flex", gap: 16 }}>
          <a
            href="/docs/sdk"
            style={{ color: "#9fb0ff", textDecoration: "none" }}
          >
            SDK Docs
          </a>
          <a
            href="/developer"
            style={{ color: "#9fb0ff", textDecoration: "none" }}
          >
            Developer Portal
          </a>
          <a
            href="/marketplace"
            style={{ color: "#9fb0ff", textDecoration: "none" }}
          >
            Marketplace
          </a>
        </div>
      </footer>
    </main>
  );
}

// ── Section Component ──────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 40 }}>
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

// ── Tabbed Code Component ──────────────────────────────────────────────

function TabbedCode({
  connectorKey,
  tabs,
}: {
  connectorKey: string;
  tabs: { id: string; label: string; code: string }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? tabs[1]?.id ?? "ts");

  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];

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
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              data-tab-active={
                isActive ? `${connectorKey}-${tab.id}` : undefined
              }
              style={{
                padding: "8px 16px",
                borderRadius: 0,
                border: "none",
                borderBottom: isActive
                  ? "2px solid #6d7cff"
                  : "2px solid transparent",
                background: "transparent",
                color: isActive ? "#6d7cff" : "#9fb0ff",
                fontWeight: isActive ? 700 : 400,
                cursor: "pointer",
                fontSize: 13,
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeTab && (
        <CodeBlock
          code={activeTab.code}
          language={activeTab.id === "curl" ? "bash" : activeTab.id === "py" ? "python" : "typescript"}
          label={activeTab.label}
        />
      )}
    </div>
  );
}
