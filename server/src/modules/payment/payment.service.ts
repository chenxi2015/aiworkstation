import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
import type { CreateOrderResponse, OrderStatusResponse } from '@aiworkstation/shared-types';
import { getDb, schema } from '../../db/index.js';
import { generateRandomId } from '../../utils/crypto.js';
import { getPlanById, getPlanByIdFromDb } from '../plans/plans.data.js';
import { type DecryptedTransaction, WeChatPayClient, type WeChatNotifyPayload } from './wechat-pay.client.js';

// In-memory order fallback
const inMemoryOrders = new Map<string, {
  orderNo: string;
  userId: string;
  planId: string;
  amountCents: number;
  status: string;
  paidAt?: Date;
}>();

export class PaymentService {
  private wechatPayClient = new WeChatPayClient();

  /**
   * Create payment order and generate Native QR code
   */
  async createOrder(userId: string, planId: string): Promise<CreateOrderResponse> {
    const plan = await getPlanByIdFromDb(planId);
    if (!plan) {
      throw new Error(`Subscription plan not found: ${planId}`);
    }

    const orderNo = `ORD_${Date.now()}_${generateRandomId('', 6)}`;
    const expiresInSeconds = 7200; // 2 hours
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    // Call WeChat Native Pay API or fallback mock
    const codeUrl = await this.wechatPayClient.createNativeOrder({
      orderNo,
      description: `AI Workstation - ${plan.name}`,
      amountCents: plan.priceCents,
    });

    // Generate Base64 QR code image for convenient frontend rendering
    const qrDataUrl = await QRCode.toDataURL(codeUrl, {
      margin: 2,
      width: 260,
    });

    try {
      const db = getDb();
      await db.insert(schema.orders).values({
        orderNo,
        userId,
        planId,
        amountCents: plan.priceCents,
        status: 'PENDING',
        codeUrl: qrDataUrl,
        expiresAt,
      });
    } catch {
      inMemoryOrders.set(orderNo, {
        orderNo,
        userId,
        planId,
        amountCents: plan.priceCents,
        status: 'PENDING',
      });
    }

    return {
      orderNo,
      codeUrl: qrDataUrl,
      amountCents: plan.priceCents,
      expiresInSeconds,
    };
  }

  /**
   * Process WeChat Pay V3 asynchronous notification (Webhook)
   */
  async handlePaymentNotification(
    timestamp: string,
    nonce: string,
    signature: string,
    rawBody: string,
  ): Promise<{ code: string; message: string }> {
    const isValid = this.wechatPayClient.verifyNotificationSignature(timestamp, nonce, rawBody, signature);
    if (!isValid) {
      throw new Error('Invalid WeChat Pay notification signature');
    }

    const payload = JSON.parse(rawBody) as WeChatNotifyPayload;
    if (payload.event_type !== 'TRANSACTION.SUCCESS') {
      return { code: 'SUCCESS', message: 'Ignored non-success event' };
    }

    const transaction: DecryptedTransaction = this.wechatPayClient.decryptNotifyResource(payload.resource);
    if (transaction.trade_state !== 'SUCCESS') {
      return { code: 'SUCCESS', message: 'Trade not successful' };
    }

    await this.fulfillOrder(transaction.out_trade_no, transaction.transaction_id);

    return { code: 'SUCCESS', message: 'OK' };
  }

  /**
   * Fulfill order: update order status and extend user membership
   */
  async fulfillOrder(orderNo: string, transactionId = 'mock_tx'): Promise<void> {
    const now = new Date();
    try {
      const db = getDb();
      const order = await db.query.orders.findFirst({
        where: eq(schema.orders.orderNo, orderNo),
      });

      if (!order) {
        const memOrder = inMemoryOrders.get(orderNo);
        if (memOrder) memOrder.status = 'PAID';
        return;
      }

      // Idempotency: skip if already fulfilled
      if (order.status === 'PAID') {
        return;
      }

      const plan = await getPlanByIdFromDb(order.planId);
      const durationDays = plan ? plan.durationDays : 30;
      const targetTier = plan ? plan.tier : 'PRO';

      // Update order status
      await db.update(schema.orders).set({
        status: 'PAID',
        wechatTransactionId: transactionId,
        paidAt: now,
        updatedAt: now,
      }).where(eq(schema.orders.orderNo, orderNo));

      // Calculate new expiration date
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, order.userId),
      });

      let startsAt = now;
      let newExpiresAt: Date;

      if (user?.memberExpiresAt && user.memberExpiresAt > now) {
        // Extend existing active membership
        startsAt = user.memberExpiresAt;
        newExpiresAt = new Date(user.memberExpiresAt.getTime() + durationDays * 86400000);
      } else {
        newExpiresAt = new Date(now.getTime() + durationDays * 86400000);
      }

      // Update user membership tier
      await db.update(schema.users).set({
        memberTier: targetTier,
        memberExpiresAt: newExpiresAt,
        updatedAt: now,
      }).where(eq(schema.users.id, order.userId));

      // Insert membership log
      await db.insert(schema.memberships).values({
        id: generateRandomId('mem', 16),
        userId: order.userId,
        orderNo,
        tier: targetTier,
        durationDays,
        startsAt,
        expiresAt: newExpiresAt,
      });
    } catch {
      const memOrder = inMemoryOrders.get(orderNo);
      if (memOrder) {
        memOrder.status = 'PAID';
        memOrder.paidAt = now;
      }
    }
  }

  /**
   * Poll order payment status
   */
  async getOrderStatus(orderNo: string): Promise<OrderStatusResponse | null> {
    try {
      const db = getDb();
      const order = await db.query.orders.findFirst({
        where: eq(schema.orders.orderNo, orderNo),
      });

      if (!order) {
        const mem = inMemoryOrders.get(orderNo);
        if (!mem) return null;
        return {
          orderNo: mem.orderNo,
          status: mem.status as OrderStatusResponse['status'],
          paidAt: mem.paidAt ? mem.paidAt.toISOString() : null,
          tier: 'PRO',
          memberExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        };
      }

      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, order.userId),
      });

      return {
        orderNo: order.orderNo,
        status: order.status as OrderStatusResponse['status'],
        paidAt: order.paidAt ? order.paidAt.toISOString() : null,
        tier: (user?.memberTier || 'FREE') as OrderStatusResponse['tier'],
        memberExpiresAt: user?.memberExpiresAt ? user.memberExpiresAt.toISOString() : null,
      };
    } catch {
      const mem = inMemoryOrders.get(orderNo);
      if (!mem) return null;
      return {
        orderNo: mem.orderNo,
        status: mem.status as OrderStatusResponse['status'],
        paidAt: mem.paidAt ? mem.paidAt.toISOString() : null,
        tier: 'PRO',
        memberExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      };
    }
  }
}
