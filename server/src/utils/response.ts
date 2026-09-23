import type { Context } from 'hono';
import { type ApiResponse, ErrorCode } from '@aiworkstation/shared-types';

/**
 * Standard successful response creator
 */
export function successResponse<T>(c: Context, data: T, message = 'Success', status: 200 | 201 = 200) {
  const body: ApiResponse<T> = {
    code: ErrorCode.SUCCESS,
    message,
    data,
    timestamp: Date.now(),
  };
  return c.json(body, status);
}

/**
 * Standard error response creator
 */
export function errorResponse(c: Context, message: string, code: number = ErrorCode.INTERNAL_ERROR, status: 400 | 401 | 403 | 404 | 500 = 500) {
  const body: ApiResponse<null> = {
    code,
    message,
    data: null,
    timestamp: Date.now(),
  };
  return c.json(body, status);
}
