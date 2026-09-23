import type { Context, Next } from 'hono';
import { ErrorCode } from '@aiworkstation/shared-types';
import { verifyJwtToken } from '../utils/crypto.js';
import { errorResponse } from '../utils/response.js';

// Extend Hono Context Variables for auth
declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    openid: string;
  }
}

/**
 * Require valid JWT authentication middleware
 */
export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(c, 'Authentication required. Please login first.', ErrorCode.UNAUTHORIZED, 401);
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyJwtToken(token);
  if (!payload) {
    return errorResponse(c, 'Invalid or expired token. Please login again.', ErrorCode.UNAUTHORIZED, 401);
  }

  c.set('userId', payload.userId);
  c.set('openid', payload.openid);

  await next();
}
