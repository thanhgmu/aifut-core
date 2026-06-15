/**
 * Input validation utilities for connector actions.
 * Uses Zod schemas for robust validation with TypeScript inference.
 */

import { JsonSchema } from './types';

/**
 * Simple schema validator for AIS JSON Schema.
 * For production, use Zod or Ajv for full JSON Schema validation.
 */
export function validateAgainstSchema(
  input: Record<string, any>,
  schema: JsonSchema,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be an object'] };
  }

  if (schema.required) {
    for (const field of schema.required) {
      if (input[field] === undefined || input[field] === null) {
        errors.push(`Missing required field: '${field}'`);
      }
    }
  }

  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (input[key] !== undefined && propSchema.type) {
        const actualType = typeof input[key];
        const expectedType = propSchema.type;

        if (expectedType === 'array' && !Array.isArray(input[key])) {
          errors.push(`Field '${key}' must be an array`);
        } else if (expectedType !== 'array' && expectedType !== 'object' && actualType !== expectedType) {
          errors.push(`Field '${key}' must be ${expectedType}, got ${actualType}`);
        }

        // Check enum
        if (propSchema.enum && !propSchema.enum.includes(input[key])) {
          errors.push(`Field '${key}' must be one of: ${propSchema.enum.join(', ')}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Zod schema generator from AIS JSON Schema.
 * For Zod-powered connectors (recommended for production).
 *
 * ```typescript
 * import { z } from 'zod';
 * import { generateZodSchema } from '@aifut/connector-sdk';
 *
 * const schema = generateZodSchema({
 *   type: 'object',
 *   properties: {
 *     email: { type: 'string', description: 'User email' },
 *     amount: { type: 'number' },
 *   },
 *   required: ['email'],
 * });
 *
 * schema.parse({ email: 'test@example.com', amount: 100 });
 * ```
 */
export function generateZodSchema(schema: JsonSchema): any {
  // Dynamic import — Zod is a peer dependency
  try {
    const zod = require('zod');

    switch (schema.type) {
      case 'string': {
        let s = zod.string();
        if (schema.enum) s = zod.enum(schema.enum as [string, ...string[]]);
        if (schema.description) s = s.describe(schema.description);
        return s;
      }
      case 'number': {
        let n = zod.number();
        if (schema.description) n = n.describe(schema.description);
        return n;
      }
      case 'boolean': {
        let b = zod.boolean();
        if (schema.description) b = b.describe(schema.description);
        return b;
      }
      case 'object': {
        const shape: Record<string, any> = {};
        if (schema.properties) {
          for (const [key, prop] of Object.entries(schema.properties)) {
            shape[key] = generateZodSchema(prop as JsonSchema);
          }
        }
        let obj = zod.object(shape);
        if (schema.required) obj = obj as any;
        return obj;
      }
      case 'array': {
        if (schema.items) {
          return zod.array(generateZodSchema(schema.items as JsonSchema));
        }
        return zod.array(zod.any());
      }
      default:
        return zod.any();
    }
  } catch {
    // Zod not available — return a passthrough
    return { parse: (v: any) => v };
  }
}
