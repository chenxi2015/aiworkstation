import type { Context } from 'hono';
import { ErrorCode } from '@aiworkstation/shared-types';
import { getValidData } from '../../common/middleware/validate.middleware.js';
import { errorJson, successJson } from '../../common/response/api-response.js';
import { AuthService } from './auth.service.js';
import type { CheckTicketQuery, MockScanQuery, WechatCallbackQuery } from './auth.schema.js';

export class AuthController {
  constructor(private readonly authService: AuthService = new AuthService()) {}

  /**
   * GET /api/auth/wx/qrcode
   * Generate WeChat QR code for login
   */
  getQrCode = async (c: Context) => {
    try {
      const data = await this.authService.createQrTicket();
      return successJson(c, data, 'QR code generated successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate QR code';
      return errorJson(c, msg, ErrorCode.WECHAT_AUTH_FAILED, 500);
    }
  };

  /**
   * GET /api/auth/wx/callback
   * WeChat OAuth callback endpoint
   */
  handleCallback = async (c: Context) => {
    const { code, state } = getValidData<WechatCallbackQuery>(c, 'query');

    try {
      const token = await this.authService.handleCallback(code, state);
      return successJson(c, { ticket: state, token }, 'WeChat authentication successful');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'OAuth verification failed';
      return errorJson(c, msg, ErrorCode.WECHAT_AUTH_FAILED, 500);
    }
  };

  /**
   * GET /api/auth/wx/mock-scan
   * Mock scan endpoint for local development
   */
  mockScan = async (c: Context) => {
    const { state } = getValidData<MockScanQuery>(c, 'query');

    try {
      const token = await this.authService.handleCallback('mock_code_for_testing', state);
      return successJson(c, { ticket: state, token }, 'Mock scan login confirmed successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Mock scan failed';
      return errorJson(c, msg, ErrorCode.INTERNAL_ERROR, 500);
    }
  };

  /**
   * GET /api/auth/wx/check
   * Poll QR code login status
   */
  checkTicket = async (c: Context) => {
    const { ticket } = getValidData<CheckTicketQuery>(c, 'query');

    try {
      const result = await this.authService.checkTicket(ticket);
      return successJson(c, result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Polling failed';
      return errorJson(c, msg, ErrorCode.INTERNAL_ERROR, 500);
    }
  };

  /**
   * GET /api/auth/me
   * Get current authenticated user profile
   */
  getMe = async (c: Context) => {
    const userId = c.get('userId');
    const user = await this.authService.getUserProfile(userId);
    if (!user) {
      return errorJson(c, 'User not found', ErrorCode.NOT_FOUND, 404);
    }
    return successJson(c, user);
  };

  /**
   * GET /api/auth/users
   * List existing users (useful for development and debugging)
   */
  listUsers = async (c: Context) => {
    const limitQuery = c.req.query('limit');
    const limit = limitQuery ? parseInt(limitQuery, 10) : 50;
    const users = await this.authService.listUsers(Number.isNaN(limit) ? 50 : limit);
    return successJson(c, { users, count: users.length });
  };

  /**
   * GET/POST /api/auth/token
   * Issue a token for an existing user by userId or openid
   */
  issueTokenForUser = async (c: Context) => {
    let userId = c.req.query('userId');
    let openid = c.req.query('openid');

    if (c.req.method === 'POST') {
      try {
        const body = (await c.req.json()) as Record<string, string>;
        userId = body.userId || userId;
        openid = body.openid || openid;
      } catch {
        // Safe to ignore if JSON body parsing fails
      }
    }

    if (!userId && !openid) {
      return errorJson(c, 'Missing userId or openid parameter', ErrorCode.VALIDATION_ERROR, 400);
    }

    const result = await this.authService.generateTokenForUser({ userId, openid });
    if (!result) {
      return errorJson(c, 'User not found', ErrorCode.NOT_FOUND, 404);
    }

    return successJson(c, result, 'Token generated successfully');
  };
}
