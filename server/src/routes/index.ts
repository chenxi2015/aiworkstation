import { Hono } from 'hono';
import { env } from '../config/env.js';
import { successJson } from '../common/response/api-response.js';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { paymentRoutes } from '../modules/payment/payment.routes.js';

export const apiRouter = new Hono();

/**
 * Health check endpoint: GET /health and GET /api/health
 */
const healthHandler = (c: any) => {
  return successJson(c, {
    status: 'ok',
    service: 'AI Workstation Cloud Server',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
};

apiRouter.get('/health', healthHandler);

// Mount modular sub-routers under /api
apiRouter.route('/auth', authRoutes);
apiRouter.route('/pay', paymentRoutes);
