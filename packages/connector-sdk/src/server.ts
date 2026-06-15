import { ActionRequest, ActionResponse, AisDiscoveryResponse } from './types';

export type RouteHandler = (
  method: string,
  path: string,
  handler: (body: any, headers: Record<string, string>) => Promise<{ status: number; body: any }>,
) => void;

/**
 * Create a minimal HTTP server for the connector.
 * Compatible with Express, Hono, or raw Node http.
 */
export function createConnectorRouter(
  getDiscovery: () => AisDiscoveryResponse,
  executeAction: (req: ActionRequest) => Promise<ActionResponse>,
): (register: RouteHandler) => void {
  return (register: RouteHandler) => {
    // Discovery endpoint
    register('GET', '/.well-known/ais', async () => ({
      status: 200,
      body: getDiscovery(),
    }));

    // Action execution endpoint
    register('POST', '/ais/actions/:key', async (body, headers) => {
      const actionKey = body?.actionKey || headers['x-action-key'];
      if (!actionKey) {
        return { status: 400, body: { success: false, error: 'Missing actionKey' } };
      }

      const result = await executeAction({
        actionKey,
        input: body?.input || {},
        context: {
          tenantId: headers['x-tenant-id'],
          requestId: headers['x-request-id'],
          retryCount: headers['x-retry-count'] ? parseInt(headers['x-retry-count']) : 0,
        },
      });

      return { status: result.success ? 200 : 400, body: result };
    });

    // Health check
    register('GET', '/health', async () => ({
      status: 200,
      body: { status: 'ok', connector: getDiscovery().connectorName },
    }));
  };
}

/**
 * Express-compatible middleware.
 */
export function createExpressRouter(
  getDiscovery: () => AisDiscoveryResponse,
  executeAction: (req: ActionRequest) => Promise<ActionResponse>,
) {
  const express = require('express');
  const router = express.Router();

  router.get('/.well-known/ais', (_req: any, res: any) => {
    res.json(getDiscovery());
  });

  router.post('/ais/actions/:key', async (req: any, res: any) => {
    const result = await executeAction({
      actionKey: req.params.key,
      input: req.body?.input || {},
      context: {
        tenantId: req.headers['x-tenant-id'],
        requestId: req.headers['x-request-id'],
      },
    });
    res.status(result.success ? 200 : 400).json(result);
  });

  router.get('/health', (_req: any, res: any) => {
    res.json({ status: 'ok', connector: getDiscovery().connectorName });
  });

  return router;
}
