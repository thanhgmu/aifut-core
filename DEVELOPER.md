# AIFUT Developer Portal

Welcome to the AIFUT developer platform. Build connectors, workflows, and integrations that
reach all AIFUT tenants across Southeast Asia and emerging markets.

---

## 🚀 Quick Links

| Resource | URL | Description |
|---|---|---|
| **AWL Playground** | `/foundation/awl-playground` | Write, validate, preview AWL workflows |
| **Template Packs** | `/templates` | 50 industry templates in 8 sellable packs |
| **ROI Calculator** | `/roi` | Calculate automation ROI for your industry |
| **API Docs** | `GET /developer/docs` | 39+ REST API endpoints |
| **AIS Spec** | `GET /developer/ais-spec` | AIFUT Integration Standard v0.1 |
| **SDKs** | `GET /developer/sdks` | Node.js + Python SDKs |
| **Webhooks** | `GET /developer/webhooks` | Webhook event standard |
| **Certification** | `GET /developer/certification` | Connector certification checklist |
| **Developer Roadmap** | `GET /developer/roadmap` | What's coming next |

## 📦 SDKs

### Node.js / TypeScript
```bash
npm install @aifut/connector-sdk
```
- `AisConnector` class with discovery + action execution
- Express/Fastify middleware support
- Zod schema validation
- Full TypeScript types

[Source: `packages/connector-sdk/`]

### Python
```bash
pip install aifut-connector-sdk
```
- `AisConnector` class with FastAPI server
- Pydantic type validation
- Async handler support

[Source: `packages/connector-sdk-python/`]

### REST API
The AIFUT API at `$API_BASE` provides 39+ endpoints across:
- Auth & Tenancy (login, register, tenants, workspaces)
- Workflows (templates, executions, AWL deploy)
- Notifications (send, templates, logs)
- Connectors (registry, adapters, templates)
- Backups (schedules, jobs, restore)
- Billing (plans, subscribe, usage)
- Marketplace (listings, install)
- Reseller (register, sub-tenants)
- Affiliate (links, conversions, payouts)
- Globalization (locales, translations)

## 🔌 AIS — AIFUT Integration Standard

The AIS defines how third-party systems connect to AIFUT.

**Key principles:**
- **Discoverable**: `/.well-known/ais` endpoint returns all metadata
- **Composable**: Multiple connectors in one workflow
- **Certifiable**: Pass the AIS test suite for official listing

### Building a Connector

1. Define your connector's actions and triggers
2. Implement the `/.well-known/ais` discovery endpoint
3. Implement `POST /ais/actions/:key` execution
4. (Optional) Implement webhook triggers
5. Pass the AIS test suite

## 📝 AWL — AIFUT Workflow Language

AWL is a YAML-based DSL for describing business workflows:

```yaml
awl: 0.1
workflow: order-confirm
name: Xác nhận đơn hàng
trigger:
  kind: event
  config: { event: "order.created" }
steps:
  - id: confirm
    name: Gửi Zalo xác nhận
    type: send
    config: { channel: "zalo", template: "order_confirm_vi" }
  - id: wait
    name: Chờ 2 tiếng
    type: wait
    config: { seconds: 7200 }
    depends_on: [confirm]
  - id: check
    name: Kiểm tra đã giao
    type: condition
    config: { field: "order.status", equals: "delivered" }
    depends_on: [wait]
  - id: review
    name: Yêu cầu đánh giá
    type: send
    config: { channel: "zalo", template: "review_request_vi" }
    depends_on: [check]
```

Try it: `/foundation/awl-playground`

## 🗺️ Roadmap

| Phase | Item | Status |
|---|---|---|
| 1 | API documentation | ✅ Done |
| 1 | Template packs marketplace | ✅ Done |
| 2 | AIS specification | ✅ Draft |
| 2 | Webhook & event docs | ✅ Draft |
| 2 | Node.js SDK | ✅ Beta |
| 2 | Python SDK | ✅ Beta |
| 3 | Developer sandbox | 📅 Q4 2026 |
| 3 | Connector certification | 📅 Q4 2026 |
| 3 | API analytics dashboard | 📅 Q1 2027 |
| 3 | AWL community tools | 📅 Q1 2027 |

## 📖 Contributing

1. Fork the repo
2. Create a connector following AIS spec
3. Test with the AIS test suite
4. Submit for certification

---

*AIFUT — Control plane for sovereign business operations.*
