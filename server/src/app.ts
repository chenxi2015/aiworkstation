import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { ErrorCode } from '@aiworkstation/shared-types';
import { AppError } from './common/errors/app-error.js';
import { errorJson, successJson } from './common/response/api-response.js';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';

export function createApp(): Hono {
  const app = new Hono();

  // Global Middlewares
  app.use('*', logger());
  app.use(
    '*',
    cors({
      origin: (origin) => origin || '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'Wechatpay-Timestamp',
        'Wechatpay-Nonce',
        'Wechatpay-Signature',
      ],
    }),
  );

  // Top-level health check endpoint for container probes
  app.get('/health', (c) => {
    return successJson(c, {
      status: 'ok',
      service: 'AI Workstation Cloud Server',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API centralized router under /api
  app.route('/api', apiRouter);

  // Global 404 Not Found Handler - returns standardized JSON
  app.notFound((c) => {
    return errorJson(
      c,
      `Resource not found: ${c.req.method} ${c.req.path}`,
      ErrorCode.NOT_FOUND,
      404,
    );
  });

  // Global Error Handler - catches unhandled exceptions and ensures pure JSON responses
  app.onError((err, c) => {
    console.error(`[Server Error] [${c.req.method} ${c.req.path}]:`, err);

    if (err instanceof AppError) {
      return errorJson(c, err.message, err.code, err.status);
    }

    const message = env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
    return errorJson(c, message, ErrorCode.INTERNAL_ERROR, 500);
  });

  return app;
}
