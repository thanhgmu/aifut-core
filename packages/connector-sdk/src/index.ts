/**
 * @aifut/connector-sdk — AIFUT Connector SDK
 *
 * Build AIS (AIFUT Integration Standard) compliant connectors.
 * Connectors built with this SDK can be discovered, connected,
 * and orchestrated by AIFUT as native integrations.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { AisConnector } from '@aifut/connector-sdk';
 *
 * const myConnector = new AisConnector({
 *   name: 'My Service',
 *   version: '1.0.0',
 *   actions: [
 *     {
 *       key: 'create_order',
 *       name: 'Create Order',
 *       input: { type: 'object', properties: { ... } },
 *       output: { type: 'object', properties: { ... } },
 *       handler: async (input) => {
 *         // Implement connector logic here
 *         return { id: 'order-123', status: 'created' };
 *       },
 *     },
 *   ],
 * });
 *
 * // Mount as Express middleware or standalone server
 * myConnector.serve(3000);
 * ```
 */

export * from './connector';
export * from './types';
export * from './validation';
export * from './server';
