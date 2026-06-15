"""
AIFUT Connector SDK — Python implementation.

Build AIS (AIFUT Integration Standard) compliant connectors.
"""

from .connector import AisConnector
from .types import (
    AisDiscoveryResponse,
    ActionDefinition,
    TriggerDefinition,
    WebhookEvent,
    ActionRequest,
    ActionResponse,
    AuthMethod,
    ConnectorCapabilities,
)

__all__ = [
    "AisConnector",
    "AisDiscoveryResponse",
    "ActionDefinition",
    "TriggerDefinition",
    "WebhookEvent",
    "ActionRequest",
    "ActionResponse",
    "AuthMethod",
    "ConnectorCapabilities",
]

__version__ = "0.1.0"
