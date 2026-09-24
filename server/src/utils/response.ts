import type { Context } from 'hono';
import { errorJson, successJson } from '../common/response/api-response.js';

/**
 * @deprecated Use successJson from '../common/response/api-response.js' instead
 */
export function successResponse<T>(c: Context, data: T, message = 'Success', status: 200 | 201 = 200) {
  return successJson(c, data, message, status);
}

/**
 * @deprecated Use errorJson from '../common/response/api-response.js' instead
 */
export function errorResponse(
  c: Context,
  message: string,
  code?: number,
  status: 400 | 401 | 403 | 404 | 500 = 500,
) {
  return errorJson(c, message, code, status);
}
