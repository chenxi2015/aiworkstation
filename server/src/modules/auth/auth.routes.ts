import { Hono } from 'hono';
import { ErrorCode } from '@aiworkstation/shared-types';
import { requireAuth } from '../../middleware/auth.js';
import { errorResponse, successResponse } from '../../utils/response.js';
import { AuthService } from './auth.service.js';

export const authRoutes = new Hono();
const authService = new AuthService();

/**
 * Generate WeChat QR code for login
 */
authRoutes.get('/wx/qrcode', async (c) => {
  try {
    const data = await authService.createQrTicket();
    return successResponse(c, data, 'QR code generated successfully');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate QR code';
    return errorResponse(c, msg, ErrorCode.WECHAT_AUTH_FAILED);
  }
});

/**
 * WeChat OAuth callback endpoint
 */
authRoutes.get('/wx/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    return c.html('<h3>Invalid OAuth callback parameters.</h3>', 400);
  }

  try {
    await authService.handleCallback(code, state);
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>Login Successful</title><meta charset="utf-8"></head>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h2 style="color: #10b981;">✓ 登录成功</h2>
          <p>您已成功扫码登录 AI Workstation，请返回客户端继续使用。</p>
          <script>
            setTimeout(() => { window.close(); }, 2500);
          </script>
        </body>
      </html>
    `);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'OAuth verification failed';
    return c.html(`<h3>登录失败: ${msg}</h3>`, 500);
  }
});

/**
 * Mock scan endpoint for local development
 */
authRoutes.get('/wx/mock-scan', async (c) => {
  const state = c.req.query('state');
  if (!state) return c.text('Missing state parameter', 400);

  try {
    await authService.handleCallback('mock_code_for_testing', state);
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>Mock Login Confirm</title><meta charset="utf-8"></head>
        <body style="font-family: sans-serif; text-align: center; padding-top: 60px;">
          <h2 style="color: #3b82f6;">[本地开发模拟] 模拟微信扫码成功</h2>
          <p>Ticket: <code>${state}</code></p>
          <p>客户端将自动完成轮询并登录！</p>
        </body>
      </html>
    `);
  } catch (err: unknown) {
    return c.text(`Mock scan failed: ${err}`, 500);
  }
});

/**
 * Poll QR code login status
 */
authRoutes.get('/wx/check', async (c) => {
  const ticket = c.req.query('ticket');
  if (!ticket) {
    return errorResponse(c, 'Missing ticket parameter', ErrorCode.VALIDATION_ERROR, 400);
  }

  try {
    const result = await authService.checkTicket(ticket);
    return successResponse(c, result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Polling failed';
    return errorResponse(c, msg, ErrorCode.INTERNAL_ERROR);
  }
});

/**
 * Get current authenticated user profile
 */
authRoutes.get('/me', requireAuth, async (c) => {
  const userId = c.get('userId');
  const user = await authService.getUserProfile(userId);
  if (!user) {
    return errorResponse(c, 'User not found', ErrorCode.NOT_FOUND, 404);
  }
  return successResponse(c, user);
});
