import { Hono } from 'hono';
import { ErrorCode } from '@aiworkstation/shared-types';
import { requireAuth } from '../../middleware/auth.js';
import { errorResponse, successResponse } from '../../utils/response.js';
import { getPlansFromDb } from '../plans/plans.data.js';
import { PaymentService } from './payment.service.js';

export const paymentRoutes = new Hono();
const paymentService = new PaymentService();

/**
 * Get available membership subscription plans (from database)
 */
paymentRoutes.get('/plans', async (c) => {
  const plans = await getPlansFromDb();
  return successResponse(c, plans);
});

/**
 * Create a new payment order
 */
paymentRoutes.post('/create-order', requireAuth, async (c) => {
  const userId = c.get('userId');
  try {
    const body = await c.req.json<{ planId: string }>();
    if (!body?.planId) {
      return errorResponse(c, 'Missing planId', ErrorCode.VALIDATION_ERROR, 400);
    }

    const orderData = await paymentService.createOrder(userId, body.planId);
    return successResponse(c, orderData, 'Order created successfully', 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create order';
    return errorResponse(c, msg, ErrorCode.WECHAT_PAY_FAILED);
  }
});

/**
 * WeChat Pay V3 asynchronous notification (Webhook)
 * Notice: Must read raw body as plain text for signature verification
 */
paymentRoutes.post('/wx-notify', async (c) => {
  const timestamp = c.req.header('Wechatpay-Timestamp') || '';
  const nonce = c.req.header('Wechatpay-Nonce') || '';
  const signature = c.req.header('Wechatpay-Signature') || '';

  try {
    const rawBody = await c.req.text();
    const result = await paymentService.handlePaymentNotification(timestamp, nonce, signature, rawBody);
    return c.json(result, 200);
  } catch (err: unknown) {
    console.error('[WeChatPay Notify Error]:', err);
    return c.json({ code: 'FAIL', message: (err as Error).message }, 500);
  }
});

/**
 * Poll order payment status
 */
paymentRoutes.get('/order-status/:orderNo', async (c) => {
  const orderNo = c.req.param('orderNo');
  if (!orderNo) {
    return errorResponse(c, 'Missing orderNo parameter', ErrorCode.VALIDATION_ERROR, 400);
  }

  try {
    const status = await paymentService.getOrderStatus(orderNo);
    if (!status) {
      return errorResponse(c, 'Order not found', ErrorCode.NOT_FOUND, 404);
    }
    return successResponse(c, status);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query order status';
    return errorResponse(c, msg, ErrorCode.INTERNAL_ERROR);
  }
});

/**
 * Mock payment fulfillment for local development and testing
 */
paymentRoutes.post('/mock-fulfill/:orderNo', async (c) => {
  const orderNo = c.req.param('orderNo');
  try {
    await paymentService.fulfillOrder(orderNo, `mock_tx_${Date.now()}`);
    return successResponse(c, { orderNo, status: 'PAID' }, 'Order mock fulfilled successfully');
  } catch (err: unknown) {
    return errorResponse(c, (err as Error).message, ErrorCode.INTERNAL_ERROR);
  }
});
