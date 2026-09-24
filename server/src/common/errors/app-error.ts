import { ErrorCode } from '@aiworkstation/shared-types';

export type HttpStatusCode = 400 | 401 | 403 | 404 | 500;

/**
 * Base custom application error with HTTP status code and business error code
 */
export class AppError extends Error {
  public readonly status: HttpStatusCode;
  public readonly code: number;

  constructor(message: string, status: HttpStatusCode = 500, code: number = ErrorCode.INTERNAL_ERROR) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * HTTP 400 Bad Request error
 */
export class BadRequestError extends AppError {
  constructor(message: string, code: number = ErrorCode.VALIDATION_ERROR) {
    super(message, 400, code);
    this.name = 'BadRequestError';
  }
}

/**
 * HTTP 401 Unauthorized error
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required', code: number = ErrorCode.UNAUTHORIZED) {
    super(message, 401, code);
    this.name = 'UnauthorizedError';
  }
}

/**
 * HTTP 403 Forbidden error
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Permission denied', code: number = ErrorCode.FORBIDDEN) {
    super(message, 403, code);
    this.name = 'ForbiddenError';
  }
}

/**
 * HTTP 404 Not Found error
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', code: number = ErrorCode.NOT_FOUND) {
    super(message, 404, code);
    this.name = 'NotFoundError';
  }
}

/**
 * HTTP 500 Internal Server Error
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', code: number = ErrorCode.INTERNAL_ERROR) {
    super(message, 500, code);
    this.name = 'InternalServerError';
  }
}
