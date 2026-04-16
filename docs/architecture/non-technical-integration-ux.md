# Non-Technical Integration UX

## Goal
AIFUT should let non-technical tenants connect existing systems into the platform core with minimal friction.

This is not a nice-to-have. It is part of the core product thesis.

If integration requires engineering help every time, AIFUT will not scale as a one-operator platform.

## UX principle
The user should feel like they are:
- choosing what they want to connect
- confirming access
- selecting what they want synced or automated
- seeing obvious success/failure guidance

The user should not feel like they are manually wiring APIs unless they choose advanced mode.

## Primary experience layers

### 1. Template-first setup
Provide named templates for common systems.

Examples:
- Connect Shopify store
- Connect WooCommerce shop
- Connect Perfex CRM
- Connect Moodle campus
- Connect Google Sheets
- Connect n8n workspace
- Connect WhatsApp channel

Each template should define:
- the provider
- expected auth method
- minimum configuration fields
- default sync objects
- recommended workflow templates
- common health checks

### 2. AI-assisted setup
The user can instead say what they want.

Examples:
- Connect my CRM and sync customers plus invoices
- Connect my online store so abandoned cart buyers enter a follow-up workflow
- Connect my learning platform and tag students by course completion

The assistant should then:
- detect likely system types
- ask for missing basics
- recommend a connector or generic bridge
- propose sync scope and mapping
- test the connection
- explain any error in human language

### 3. Advanced mode
This is for users, partners, or operators who need precision.

Capabilities:
- custom REST endpoints
- OAuth or header auth configuration
- custom field mapping
- webhook endpoints
- retry and rate-limit settings
- event/action templates

## Wizard design
Every guided integration should follow a similar wizard.

### Step 1 — choose system type
Examples:
- CRM
- Ecommerce
- LMS
- Messaging
- AI tool
- Analytics tool
- Storage system
- Custom app

### Step 2 — choose provider or custom
Examples:
- Shopify
- WooCommerce
- Perfex
- Moodle
- n8n
- Generic REST/OAuth
- Webhook bridge

### Step 3 — connect credentials/access
Examples:
- domain URL
- API key
- OAuth sign-in
- webhook secret
- account/workspace selection

### Step 4 — test connection
Return simple results:
- Connected successfully
- Authentication failed
- Domain unreachable
- Permission scope incomplete
- API rate limit detected

### Step 5 — choose sync/automation scope
Examples:
- customers
- orders
- invoices
- products
- enrollments
- messages
- contacts
- tickets

### Step 6 — choose mapping defaults
Examples:
- map customer to contact/member
- map orders to commerce events
- map students to learning member profiles
- emit billing/usage events on paid transactions

### Step 7 — review and enable
The user sees:
- what is connected
- what will sync
- what workflows will trigger
- what permissions were granted
- how to disconnect or change settings later

## Health and error UX
Users should not need technical interpretation to understand failures.

The product should clearly explain:
- invalid credentials
- expired OAuth tokens
- bad webhook signature
- unreachable endpoint
- missing required fields
- unsupported object mapping
- rate limit pressure
- partial sync failures

Errors should answer three questions:
1. what failed
2. why it likely failed
3. what the user should do next

## Minimum reusable integration objects
To keep the experience consistent, the UI and API should share these concepts:
- connector template
- connection instance
- verification result
- sync policy
- mapping profile
- health summary
- workflow handoff rule
- usage/billing impact hint

## Business importance
This UX layer is what turns AIFUT from a technical platform into a commercially adoptable operator system.

Without it:
- integrations become consulting work
- onboarding cost stays high
- non-technical tenants churn
- commercialization of workflows/connectors stays weak

With it:
- adoption gets easier
- marketplace value increases
- connectors become reusable revenue-generating assets
- one operator can help many tenants onboard faster
