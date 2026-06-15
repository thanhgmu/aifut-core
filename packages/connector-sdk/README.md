# @aifut/connector-sdk

Build AIS (AIFUT Integration Standard) compliant connectors for the AIFUT platform.

## Installation

```bash
npm install @aifut/connector-sdk
```

## Quick Start

```typescript
import { AisConnector } from '@aifut/connector-sdk';

// Define your connector
const crmConnector = new AisConnector({
  name: 'MyCRM',
  version: '1.0.0',
  authMethods: ['oauth2'],
  capabilities: { read: true, write: true, search: true },
  actions: [
    {
      key: 'create_contact',
      name: 'Create Contact',
      description: 'Creates a new contact in MyCRM',
      input: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Contact full name' },
          email: { type: 'string', description: 'Contact email address' },
          phone: { type: 'string', description: 'Contact phone number' },
        },
        required: ['name', 'email'],
      },
      output: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Created contact ID' },
          status: { type: 'string' },
        },
      },
      idempotent: true,
      timeoutMs: 30000,
      handler: async (input) => {
        // Implement your API call here
        return { id: `crm-${Date.now()}`, status: 'created' };
      },
    },
  ],
});

// Serve as standalone HTTP server
import { createConnectorRouter } from '@aifut/connector-sdk';
// ... (mount on Express, Hono, or Node http)
```

## AIS Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/.well-known/ais` | GET | Discovery — returns connector metadata, actions, triggers |
| `/ais/actions/:key` | POST | Execute a connector action |
| `/health` | GET | Health check |

## What is AIS?

The AIFUT Integration Standard (AIS) defines a contract between AIFUT and any external system. Connectors implementing AIS are:

- **Discoverable** — AIFUT automatically finds and introspects them
- **Orchestratable** — Workflow engine can call connector actions
- **Composable** — Multiple connectors work together in a single workflow
- **Certifiable** — Pass the AIS test suite for official listing

## License

MIT
