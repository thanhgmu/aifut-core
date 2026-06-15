"""
AIS-compliant connector builder — Python implementation.
"""

from typing import Any, Callable, Optional
from .types import ActionRequest, ActionResponse, AisDiscoveryResponse


class AisConnector:
    """
    AIS-compliant connector builder.

    Usage:
        connector = AisConnector(name="MyCRM", version="1.0.0", actions=[...])
        connector.serve(port=3000)  # Start FastAPI server
    """

    def __init__(
        self,
        name: str,
        version: str = "1.0.0",
        actions: Optional[list[dict]] = None,
        triggers: Optional[list[dict]] = None,
        auth_methods: Optional[list[str]] = None,
        capabilities: Optional[dict] = None,
    ):
        self.name = name
        self.version = version
        self._actions: dict[str, dict] = {}
        self._triggers: dict[str, dict] = {}
        self.auth_methods = auth_methods or ["api_key"]
        self.capabilities = {
            "read": True,
            "write": True,
            "webhook": False,
            "batch": False,
            "search": False,
            **(capabilities or {}),
        }

        if actions:
            for action in actions:
                key = action["key"]
                self._actions[key] = action

        if triggers:
            for trigger in triggers:
                key = trigger["key"]
                self._triggers[key] = trigger

    def get_discovery(self) -> dict:
        """Get the AIS discovery response (GET /.well-known/ais)."""
        return {
            "aisVersion": "0.1",
            "connectorName": self.name,
            "connectorVersion": self.version,
            "capabilities": self.capabilities,
            "actions": [
                {k: v for k, v in a.items() if k != "handler"}
                for a in self._actions.values()
            ],
            "triggers": list(self._triggers.values()),
            "authMethods": self.auth_methods,
        }

    async def execute_action(self, req: ActionRequest) -> ActionResponse:
        """Execute a connector action by key (POST /ais/actions/:key)."""
        import time
        start = time.time()

        action = self._actions.get(req.action_key)
        if not action:
            return ActionResponse(
                success=False,
                error=f"Unknown action: {req.action_key}",
                meta={"duration_ms": int((time.time() - start) * 1000), "retryable": False},
            )

        try:
            handler = action.get("handler")
            if handler is None:
                return ActionResponse(
                    success=False,
                    error=f"No handler for action: {req.action_key}",
                    meta={"duration_ms": int((time.time() - start) * 1000), "retryable": False},
                )

            # Call the handler (sync or async)
            result = handler(req.input, req.context)
            if hasattr(result, "__await__"):
                result = await result

            return ActionResponse(
                success=True,
                data=result,
                meta={
                    "duration_ms": int((time.time() - start) * 1000),
                    "retryable": action.get("idempotent", True),
                },
            )
        except Exception as e:
            return ActionResponse(
                success=False,
                error=str(e),
                meta={
                    "duration_ms": int((time.time() - start) * 1000),
                    "retryable": action.get("idempotent", True),
                },
            )

    def serve(self, host: str = "0.0.0.0", port: int = 3000):
        """Start a FastAPI server for the connector."""
        try:
            from fastapi import FastAPI, Request
            import uvicorn

            app = FastAPI(
                title=self.name,
                version=self.version,
                description="AIS-compliant connector",
            )

            @app.get("/.well-known/ais")
            async def discovery():
                return self.get_discovery()

            @app.post("/ais/actions/{action_key}")
            async def execute(action_key: str, request: Request):
                body = await request.json()
                req = ActionRequest(
                    action_key=action_key,
                    input=body.get("input", {}),
                    context={
                        "tenant_id": request.headers.get("x-tenant-id"),
                        "request_id": request.headers.get("x-request-id"),
                    },
                )
                result = await self.execute_action(req)
                status_code = 200 if result.success else 400
                return type('Response', (), {
                    'status_code': status_code,
                    'body': result.__dict__,
                    'json': lambda self: self.body,
                })()

            @app.get("/health")
            async def health():
                return {"status": "ok", "connector": self.name}

            print(f"Connector '{self.name}' serving at http://{host}:{port}")
            uvicorn.run(app, host=host, port=port)

        except ImportError:
            raise ImportError(
                "FastAPI is required to serve the connector. "
                "Install with: pip install aifut-connector-sdk[dev]"
            )
