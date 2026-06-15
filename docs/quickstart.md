# AIFUT Quick Start
>
> Get from zero to running AIFUT in under 10 minutes.

## What You'll Get

By the end of this guide, you'll have:
1. A running AIFUT instance (API + Web + Database)
2. Your first workspace and workflow
3. A template installed from the marketplace
4. Overview of billing and team management

---

## Step 1: Start the Platform (2 min)

### Option A: Docker (Production / Staging)

```bash
# Clone and start
git clone https://github.com/thanhgmu/aifut-core.git
cd aifut-core
cp deploy/.env.example .env   # Edit with your secrets
docker compose up -d

# Run database migrations
docker compose run --rm api npx prisma migrate deploy

# Seed demo data (optional)
docker compose run --rm api npx ts-node apps/api/scripts/seed-demo.ts
```

### Option B: Local Development

```bash
# Start only PostgreSQL
docker compose up -d postgres

# Terminal 2 — API
cd apps/api
cp .env.example .env   # Edit DATABASE_URL, JWT_SECRET
npm install
npx prisma migrate deploy
npm run start:dev

# Terminal 3 — Web
cd apps/web
npm install
npm run dev
```

---

## Step 2: Create Your Account (1 min)

1. Open **http://localhost:3000** in your browser
2. Click **Get Started** → Create account with email + password
3. Your first workspace is created automatically
4. You're now logged in as workspace **OWNER**

---

## Step 3: Install a Template (2 min)

1. Go to **Templates** → Browse 50 industry workflow templates
2. Filter by industry (F&B, Retail, Healthcare, Education, etc.)
3. Click any template → **Install** → It's added to your workspace
4. Customize the workflow in the **Workflows** view

---

## Step 4: Create a Workflow with AWL (3 min)

AWL (AIFUT Workflow Language) lets you describe workflows in plain text:

```yaml
name: "Daily Order Summary"
trigger:
  schedule: "0 9 * * 1-5"       # Weekdays at 9am
steps:
  - action: "report.generate"
    input:
      type: "orders"
      period: "yesterday"
  - action: "notify.send"
    input:
      channel: "email"
      to: "manager@company.com"
      template: "daily-summary"
```

1. Go to **Playground** → Paste the AWL above
2. Click **Validate** → It checks syntax
3. Click **Deploy** → Your workflow is live

---

## Step 5: Configure Billing (1 min)

1. Go to **Pricing** → Choose a plan (Free, Starter, Pro, or Team)
2. Free tier: Up to 5 workflows, 1,000 AI calls/month
3. Pro tier: Unlimited workflows, 50K AI calls, priority support
4. Payment via **VNPay** (Vietnam) or **MoMo** (Vietnam) — international via Stripe (coming)
5. Subscribe → Billing dashboard tracks usage

---

## What's Next

| Area | Where to Go |
|---|---|
| **Connectors** | Connect external apps (CRM, email, APIs) via /foundation |
| **Notifications** | Set up email/Zalo/SMS/Slack alerts via /notifications |
| **Backups** | Schedule automated data backups via /backups |
| **Marketplace** | Browse community connectors via /marketplace |
| **Team** | Invite team members with role-based access |
| **Developer Portal** | Build your own connectors with AIS SDK |
| **API Keys** | Generate keys for programmatic access via /api-keys |

---

## Need Help?

- **Docs**: Read the full deployment guide at `docs/deployment.md`
- **Status**: Check `http://localhost:3002/health` for API health
- **Architecture**: See `docs/architecture.md` for system design
