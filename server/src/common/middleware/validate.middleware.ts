import type { Context, Next } from 'hono';
import { type ZodTypeAny, ZodError } from 'zod';
import { ErrorCode } from '@aiworkstation/shared-types';
import { errorJson } from '../response/api-response.js';

export type ValidationTarget = 'json' | 'query' | 'param';

/**
 * Format first issue of ZodError into a human-readable message
 */
function formatZodError(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return 'Invalid input data';
  const path = first.path.join('.');
  return path ? `Field '${path}': ${first.message}` : first.message;
}

/**
 * Universal Zod validation middleware for json body, query string, or route params
 */
export function validate<T extends ZodTypeAny>(target: ValidationTarget, schema: T) {
  return async (c: Context, next: Next) => {
    let rawData: unknown;

    try {
      if (target === 'json') {
        rawData = await c.req.json();
      } else if (target === 'query') {
        rawData = c.req.query();
      } else if (target === 'param') {
        rawData = c.req.param();
      }
    } catch {
      return errorJson(
        c,
        target === 'json' ? 'Malformed JSON request body' : 'Failed to parse request parameters',
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }

    const result = schema.safeParse(rawData);
    if (!result.success) {
      const message = formatZodError(result.error);
      return errorJson(c, message, ErrorCode.VALIDATION_ERROR, 400);
    }

    // Attach validated and transformed data to context variables
    c.set(`valid_${target}`, result.data);
    await next();
  };
}

/**
 * Helper to retrieve validated data from Hono Context with type inference
 */
export function getValidData<T>(c: Context, target: ValidationTarget): T {
  return c.get(`valid_${target}`) as T;
}
