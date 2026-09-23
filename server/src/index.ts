import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './config/env.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { paymentRoutes } from './modules/payment/payment.routes.js';
import { seedPlansIfEmpty } from './modules/plans/plans.data.js';
import { successResponse } from './utils/response.js';

// Auto-seed default database subscription plans if table is empty
seedPlansIfEmpty().catch((err) => console.warn('[Startup] seedPlans failed:', err));

const app = new Hono();

// Middlewares
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Wechatpay-Timestamp', 'Wechatpay-Nonce', 'Wechatpay-Signature'],
  }),
);

// Health check endpoint
app.get('/health', (c) => {
  return successResponse(c, {
    status: 'ok',
    service: 'AI Workstation Cloud Server',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Mount modules
app.route('/api/auth', authRoutes);
app.route('/api/pay', paymentRoutes);

// Global 404 handler
app.notFound((c) => {
  return c.json({ code: 404, message: 'Resource not found', path: c.req.path }, 404);
});

// Start server
console.log(`Starting AI Workstation Cloud Server on http://${env.HOST}:${env.PORT} ...`);
serve({
  fetch: app.fetch,
  port: env.PORT,
  hostname: env.HOST,
}, (info) => {
  console.log(`🚀 Cloud Server is listening on http://${info.address}:${info.port}`);
  console.log(`   Health check: http://localhost:${info.port}/health`);
  console.log(`   WeChat QR auth: http://localhost:${info.port}/api/auth/wx/qrcode`);
  console.log(`   Plans list:   http://localhost:${info.port}/api/pay/plans`);
});
