import { boolean, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Users table
 */
export const users = pgTable('users', {
  id: varchar('id', { length: 64 }).primaryKey(),
  openid: varchar('openid', { length: 128 }).notNull().unique(),
  unionid: varchar('unionid', { length: 128 }),
  nickname: varchar('nickname', { length: 128 }).default('WeChat User').notNull(),
  avatarUrl: text('avatar_url').default('').notNull(),
  memberTier: varchar('member_tier', { length: 32 }).default('FREE').notNull(),
  memberExpiresAt: timestamp('member_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Authentication tickets for WeChat QR login session polling
 */
export const authTickets = pgTable('auth_tickets', {
  ticket: varchar('ticket', { length: 64 }).primaryKey(),
  status: varchar('status', { length: 32 }).default('PENDING').notNull(),
  userId: varchar('user_id', { length: 64 }).references(() => users.id),
  token: text('token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Payment orders
 */
export const orders = pgTable('orders', {
  orderNo: varchar('order_no', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).references(() => users.id).notNull(),
  planId: varchar('plan_id', { length: 64 }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: varchar('status', { length: 32 }).default('PENDING').notNull(),
  wechatPrepayId: varchar('wechat_prepay_id', { length: 128 }),
  wechatTransactionId: varchar('wechat_transaction_id', { length: 128 }),
  codeUrl: text('code_url'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Membership subscriptions log
 */
export const memberships = pgTable('memberships', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).references(() => users.id).notNull(),
  orderNo: varchar('order_no', { length: 64 }).references(() => orders.orderNo).notNull(),
  tier: varchar('tier', { length: 32 }).notNull(),
  durationDays: integer('duration_days').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Subscription plans configuration stored in database
 */
export const subscriptionPlans = pgTable('subscription_plans', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull(),
  priceCents: integer('price_cents').notNull(), // e.g. 3600 = ¥36.00
  originalPriceCents: integer('original_price_cents').notNull(),
  durationDays: integer('duration_days').notNull(),
  tier: varchar('tier', { length: 32 }).default('PRO').notNull(),
  recommended: boolean('recommended').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
