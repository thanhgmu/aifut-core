# aifut-connector-sdk

Build AIS (AIFUT Integration Standard) compliant connectors for the AIFUT platform.

## Installation

```bash
pip install aifut-connector-sdk
```

## Quick Start

```python
from aifut_connector_sdk import AisConnector

# Define your connector
crm_connector = AisConnector(
    name="MyCRM",
    version="1.0.0",
    auth_methods=["oauth2"],
    capabilities={"read": True, "write": True, "search": True},
    actions=[
        {
            "key": "create_contact",
            "name": "Create Contact",
            "description": "Creates a new contact in MyCRM",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Contact full name"},
                    "email": {"type": "string", "description": "Contact email"},
                },
                "required": ["name", "email"],
            },
            "output_schema": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "status": {"type": "string"},
                },
            },
            "idempotent": True,
            "timeout_ms": 30000,
            "handler": lambda input, ctx=None: {
                "id": f"crm-{hash(input['email'])}",
                "status": "created",
            },
        },
    ],
)

# Serve with FastAPI
crm_connector.serve(host="0.0.0.0", port=3000)
```

## AIS Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/.well-known/ais` | GET | Discovery — connector metadata, actions, triggers |
| `/ais/actions/{key}` | POST | Execute a connector action |
| `/health` | GET | Health check |

## License

MIT
