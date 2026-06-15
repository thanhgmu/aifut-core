"""
AIS (AIFUT Integration Standard) type definitions for Python.
"""

from dataclasses import dataclass, field
from typing import Any, Callable, Optional


@dataclass
class JsonSchema:
    """JSON Schema definition for action input/output."""
    type: str  # "string" | "number" | "boolean" | "object" | "array"
    properties: Optional[dict[str, "JsonSchema"]] = None
    items: Optional["JsonSchema"] = None
    required: Optional[list[str]] = None
    description: Optional[str] = None
    enum: Optional[list[str]] = None


@dataclass
class ActionDefinition:
    """Action definition — what operations the connector can perform."""
    key: str
    name: str
    description: str
    input_schema: dict
    output_schema: dict
    idempotent: bool = True
    timeout_ms: int = 30000


@dataclass
class TriggerDefinition:
    """Trigger definition — what events the connector can emit."""
    key: str
    name: str
    description: str
    event_schema: dict
    delivery: str = "webhook"  # "webhook" | "polling"


@dataclass
class ConnectorCapabilities:
    """Connector capability flags."""
    read: bool = True
    write: bool = True
    webhook: bool = False
    batch: bool = False
    search: bool = False


@dataclass
class AisDiscoveryResponse:
    """AIS discovery endpoint response."""
    ais_version: str = "0.1"
    connector_name: str = ""
    connector_version: str = "1.0.0"
    capabilities: Optional[ConnectorCapabilities] = None
    actions: list[dict] = field(default_factory=list)
    triggers: list[dict] = field(default_factory=list)
    auth_methods: list[str] = field(default_factory=lambda: ["api_key"])


@dataclass
class WebhookEvent:
    """Webhook event envelope."""
    event_id: str
    event_type: str
    occurred_at: str
    data: dict


@dataclass
class ActionRequest:
    """Action invocation request."""
    action_key: str
    input: dict
    context: Optional[dict] = None


@dataclass
class ActionResponse:
    """Action invocation response."""
    success: bool
    data: Optional[dict] = None
    error: Optional[str] = None
    meta: Optional[dict] = None


AuthMethod = str  # "oauth2" | "api_key" | "basic"
