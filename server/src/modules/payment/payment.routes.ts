import { Hono } from 'hono';
import { requireAuth } from '../../common/middleware/auth.middleware.js';
import { validate } from '../../common/middleware/validate.middleware.js';
import { PaymentController } from './payment.controller.js';
import { createOrderSchema, orderNoParamSchema } from './payment.schema.js';

export const paymentRoutes = new Hono();
const paymentController = new PaymentController();

/**
 * Get available membership subscription plans
 */
paymentRoutes.get('/plans', paymentController.getPlans);

/**
 * Create a new payment order
 */
paymentRoutes.post(
  '/create-order',
  requireAuth,
  validate('json', createOrderSchema),
  paymentController.createOrder,
);

/**
 * WeChat Pay V3 asynchronous notification (Webhook)
 */
paymentRoutes.post('/wx-notify', paymentController.handleWxNotify);

/**
 * Poll order payment status
 */
paymentRoutes.get(
  '/order-status/:orderNo',
  validate('param', orderNoParamSchema),
  paymentController.getOrderStatus,
);

/**
 * Mock payment fulfillment for local development and testing
 */
paymentRoutes.post(
  '/mock-fulfill/:orderNo',
  validate('param', orderNoParamSchema),
  paymentController.mockFulfill,
);
