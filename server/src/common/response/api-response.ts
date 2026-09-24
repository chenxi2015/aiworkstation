import type { Context } from 'hono';
import { type ApiResponse, ErrorCode } from '@aiworkstation/shared-types';

/**
 * Standard successful JSON response helper (HTTP 200 or 201)
 */
export function successJson<T>(
  c: Context,
  data: T,
  message = 'Success',
  status: 200 | 201 = 200,
) {
  const body: ApiResponse<T> = {
    code: ErrorCode.SUCCESS,
    message,
    data,
    timestamp: Date.now(),
  };
  return c.json(body, status);
}

/**
 * Standard error JSON response helper (HTTP 400, 401, 403, 404, 500, etc.)
 */
export function errorJson(
  c: Context,
  message: string,
  code: number = ErrorCode.INTERNAL_ERROR,
  status: 400 | 401 | 403 | 404 | 500 = 500,
  data: null = null,
) {
  const body: ApiResponse<null> = {
    code,
    message,
    data,
    timestamp: Date.now(),
  };
  return c.json(body, status);
}
