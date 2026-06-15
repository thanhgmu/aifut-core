# AIFUT Regional Deployment
>
> Multi-country deployment configurations for Southeast and Northeast Asia.

```
infra/regions/
├── vn/          # Vietnam — Hanoi/Singapore VPS (primary market)
├── sg/          # Singapore — APAC regional hub
├── th/          # Thailand — Bangkok VPS
├── jp/          # Japan — Tokyo VPS
├── us/          # United States — US-West coast
└── README.md    # This file
```

## Region Architecture

Each region runs an independent AIFUT instance with:
- PostgreSQL (primary database, local)
- API server (:3002)
- Web frontend (:3000)
- Nginx reverse proxy with SSL

Region-specific domains route to the correct deployment:
- Vietnam: `aifut.vn`, `api.aifut.vn`
- Singapore: `aifut.sg`, `api.aifut.sg`
- Thailand: `aifut.co.th`, `api.aifut.co.th`
- Japan: `aifut.jp`, `api.aifut.jp`
- US: `aifut.us`, `api.aifut.us`

## Deploy to a Region

```bash
# Deploy to Vietnam
bash infra/deploy-region.sh vn

# Deploy to Singapore
bash infra/deploy-region.sh sg

# Deploy to Thailand
bash infra/deploy-region.sh th
```

## Per-Region Configuration

| Setting | VN | SG | TH | JP | US |
|---|---|---|---|---|---|
| Default Currency | VND | SGD | THB | JPY | USD |
| Default Locale | vi | en | th | ja | en |
| Timezone | Asia/Ho_Chi_Minh | Asia/Singapore | Asia/Bangkok | Asia/Tokyo | America/Los_Angeles |
| Payment Gateways | VNPay, MoMo | Stripe | PromptPay | PayPay, Konbini | Stripe |
| AI Routing | vn-central-1 | ap-southeast-1 | ap-southeast-1 | ap-northeast-1 | us-west-2 |
| Data Residency | Vietnam | Singapore | Thailand | Japan | US-West |

## Data Residency & Compliance

Per-region instances ensure:
- Local data storage within region boundaries
- Compliance with regional regulations (Vietnam's Cybersecurity Law, PDPA, Japan's APPI, etc.)
- Reduced latency for local users
- Independent backup schedules per region

## Cross-Region Sync (Future)

Planned cross-region features:
- Global tenant directory (read-only, no PII)
- Connector marketplace feed (cross-region publishing)
- Admin dashboard with region-switcher
