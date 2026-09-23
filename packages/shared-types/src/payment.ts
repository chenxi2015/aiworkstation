import type { MemberTier } from './auth.js';

/**
 * Payment order status
 */
export type OrderStatus = 'PENDING' | 'PAID' | 'CLOSED' | 'REFUNDED';

/**
 * Subscription plan option
 */
export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  priceCents: number; // In RMB cents, e.g. 1990 = ¥19.90
  originalPriceCents: number;
  durationDays: number;
  tier: MemberTier;
  recommended?: boolean;
}

/**
 * Request payload to create a payment order
 */
export interface CreateOrderRequest {
  planId: string;
}

/**
 * Payment order creation result
 */
export interface CreateOrderResponse {
  orderNo: string;
  codeUrl: string; // WeChat native QR payment URL
  amountCents: number;
  expiresInSeconds: number;
}

/**
 * Order status polling response
 */
export interface OrderStatusResponse {
  orderNo: string;
  status: OrderStatus;
  paidAt: string | null;
  tier: MemberTier;
  memberExpiresAt: string | null;
}
