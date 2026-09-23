/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

/**
 * Common business error codes
 */
export enum ErrorCode {
  SUCCESS = 0,
  UNAUTHORIZED = 40101,
  FORBIDDEN = 40301,
  NOT_FOUND = 40401,
  VALIDATION_ERROR = 42201,
  INTERNAL_ERROR = 50001,
  WECHAT_AUTH_FAILED = 50101,
  WECHAT_PAY_FAILED = 50201,
  ORDER_EXPIRED = 50202,
}
