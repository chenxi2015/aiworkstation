import { Hono } from 'hono';
import { requireAuth } from '../../common/middleware/auth.middleware.js';
import { validate } from '../../common/middleware/validate.middleware.js';
import { AuthController } from './auth.controller.js';
import {
  checkTicketQuerySchema,
  mockScanQuerySchema,
  wechatCallbackQuerySchema,
} from './auth.schema.js';

export const authRoutes = new Hono();
const authController = new AuthController();

/**
 * Generate WeChat QR code for login
 */
authRoutes.get('/wx/qrcode', authController.getQrCode);

/**
 * WeChat OAuth callback endpoint
 */
authRoutes.get(
  '/wx/callback',
  validate('query', wechatCallbackQuerySchema),
  authController.handleCallback,
);

/**
 * Mock scan endpoint for local development
 */
authRoutes.get(
  '/wx/mock-scan',
  validate('query', mockScanQuerySchema),
  authController.mockScan,
);

/**
 * Poll QR code login status
 */
authRoutes.get(
  '/wx/check',
  validate('query', checkTicketQuerySchema),
  authController.checkTicket,
);

/**
 * Get current authenticated user profile
 */
authRoutes.get('/me', requireAuth, authController.getMe);
