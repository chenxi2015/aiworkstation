import type { Context } from 'hono';
import { ErrorCode } from '@aiworkstation/shared-types';
import { getValidData } from '../../common/middleware/validate.middleware.js';
import { errorJson, successJson } from '../../common/response/api-response.js';
import { getPlansFromDb } from '../plans/plans.data.js';
import { PaymentService } from './payment.service.js';
import type { CreateOrderBody, OrderNoParam } from './payment.schema.js';

export class PaymentController {
  constructor(private readonly paymentService: PaymentService = new PaymentService()) {}

  /**
   * GET /api/pay/plans
   * Get available membership subscription plans
   */
  getPlans = async (c: Context) => {
    try {
      const plans = await getPlansFromDb();
      return successJson(c, plans);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve plans';
      return errorJson(c, msg, ErrorCode.INTERNAL_ERROR, 500);
    }
  };

  /**
   * POST /api/pay/create-order
   * Create a new payment order for the authenticated user
   */
  createOrder = async (c: Context) => {
    const userId = c.get('userId');
    const { planId } = getValidData<CreateOrderBody>(c, 'json');

    try {
      const orderData = await this.paymentService.createOrder(userId, planId);
      return successJson(c, orderData, 'Order created successfully', 201);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create order';
      return errorJson(c, msg, ErrorCode.WECHAT_PAY_FAILED, 500);
    }
  };

  /**
   * POST /api/pay/wx-notify
   * WeChat Pay V3 asynchronous notification (Webhook)
   * Note: WeChat Pay gateway protocol expects { code, message } JSON
   */
  handleWxNotify = async (c: Context) => {
    const timestamp = c.req.header('Wechatpay-Timestamp') || '';
    const nonce = c.req.header('Wechatpay-Nonce') || '';
    const signature = c.req.header('Wechatpay-Signature') || '';

    try {
      const rawBody = await c.req.text();
      const result = await this.paymentService.handlePaymentNotification(
        timestamp,
        nonce,
        signature,
        rawBody,
      );
      return c.json(result, 200);
    } catch (err: unknown) {
      console.error('[WeChatPay Notify Error]:', err);
      const msg = err instanceof Error ? err.message : 'Notification processing failed';
      return c.json({ code: 'FAIL', message: msg }, 500);
    }
  };

  /**
   * GET /api/pay/order-status/:orderNo
   * Poll order payment status
   */
  getOrderStatus = async (c: Context) => {
    const { orderNo } = getValidData<OrderNoParam>(c, 'param');

    try {
      const status = await this.paymentService.getOrderStatus(orderNo);
      if (!status) {
        return errorJson(c, 'Order not found', ErrorCode.NOT_FOUND, 404);
      }
      return successJson(c, status);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to query order status';
      return errorJson(c, msg, ErrorCode.INTERNAL_ERROR, 500);
    }
  };

  /**
   * POST /api/pay/mock-fulfill/:orderNo
   * Mock payment fulfillment for local testing
   */
  mockFulfill = async (c: Context) => {
    const { orderNo } = getValidData<OrderNoParam>(c, 'param');

    try {
      await this.paymentService.fulfillOrder(orderNo, `mock_tx_${Date.now()}`);
      return successJson(c, { orderNo, status: 'PAID' }, 'Order mock fulfilled successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fulfill order';
      return errorJson(c, msg, ErrorCode.INTERNAL_ERROR, 500);
    }
  };
}
