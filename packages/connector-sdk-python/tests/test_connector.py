"""
Tests for aifut-connector-sdk.
"""
import pytest
from aifut_connector_sdk import AisConnector, ActionRequest, ActionResponse


def test_connector_initialization():
    """Connector can be created with basic config."""
    c = AisConnector(name="TestConnector", version="1.0.0")
    assert c.name == "TestConnector"
    assert c.version == "1.0.0"
    assert c.get_discovery()["connectorName"] == "TestConnector"


def test_connector_with_actions():
    """Connector with actions returns correct discovery response."""
    def handler(input: dict, ctx: dict = None) -> dict:
        return {"result": f"Hello {input['name']}"}

    c = AisConnector(
        name="Greeter",
        actions=[
            {
                "key": "greet",
                "name": "Greet",
                "description": "Greets a person",
                "input_schema": {
                    "type": "object",
                    "properties": {"name": {"type": "string"}},
                    "required": ["name"],
                },
                "output_schema": {"type": "object", "properties": {"result": {"type": "string"}}},
                "idempotent": False,
                "timeout_ms": 5000,
                "handler": handler,
            }
        ],
    )

    discovery = c.get_discovery()
    assert len(discovery["actions"]) == 1
    assert discovery["actions"][0]["key"] == "greet"


@pytest.mark.asyncio
async def test_connector_execute_action():
    """Connector executes actions correctly."""
    def handler(input: dict, ctx: dict = None) -> dict:
        return {"result": f"Hello {input['name']}"}

    c = AisConnector(
        name="Greeter",
        actions=[
            {
                "key": "greet",
                "name": "Greet",
                "description": "Greets a person",
                "input_schema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
                "output_schema": {"type": "object", "properties": {"result": {"type": "string"}}},
                "idempotent": False,
                "timeout_ms": 5000,
                "handler": handler,
            }
        ],
    )

    req = ActionRequest(action_key="greet", input={"name": "World"})
    resp = await c.execute_action(req)

    assert resp.success is True
    assert resp.data == {"result": "Hello World"}


def test_connector_unknown_action():
    """Connector returns error for unknown action."""
    c = AisConnector(name="Test")

    req = ActionRequest(action_key="nonexistent", input={})
    resp = c.execute_action(req)

    assert resp.success is False
    assert "Unknown action" in (resp.error or "")


def test_discovery_response_structure():
    """Discovery response has all required fields."""
    c = AisConnector(name="FullConnector", version="2.0.0", capabilities={"read": True, "write": True})
    d = c.get_discovery()

    assert d["aisVersion"] == "0.1"
    assert d["connectorName"] == "FullConnector"
    assert d["connectorVersion"] == "2.0.0"
    assert "actions" in d
    assert "triggers" in d
    assert "authMethods" in d
    assert d["capabilities"]["read"] is True
    assert d["capabilities"]["write"] is True


def test_connector_with_triggers():
    """Connector with triggers returns them in discovery."""
    c = AisConnector(
        name="Eventful",
        triggers=[
            {
                "key": "order.created",
                "name": "Order Created",
                "description": "Triggered when a new order is created",
                "event_schema": {"type": "object", "properties": {"order_id": {"type": "string"}}},
                "delivery": "webhook",
            }
        ],
    )

    d = c.get_discovery()
    assert len(d["triggers"]) == 1
    assert d["triggers"][0]["key"] == "order.created"
