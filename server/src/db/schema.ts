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
 * Tier → capability entitlements（会员档位权益矩阵，数据驱动）。
 * 加档位/调权益 = 改本表数据，不改代码。
 * 例：VIP → chat/embedding/web_search；SVIP → +vision/image_gen；LIFETIME → 全部。
 */
export const tierEntitlements = pgTable('tier_entitlements', {
  id: varchar('id', { length: 64 }).primaryKey(),
  tier: varchar('tier', { length: 32 }).notNull(), // VIP / SVIP / LIFETIME
  capability: varchar('capability', { length: 32 }).notNull(), // chat / vision / embedding / web_search / image_gen / video_gen
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 官方通道上游配置（替代写死的 OFFICIAL_UPSTREAM_URL 常量与 env key）。
 * 每个能力一行：代理路由据此注入上游地址与密钥并透传请求。
 */
export const officialChannels = pgTable('official_channels', {
  capability: varchar('capability', { length: 32 }).primaryKey(), // chat / vision / embedding / web_search / image_gen / video_gen
  provider: varchar('provider', { length: 64 }).notNull(), // deepseek / siliconflow / doubao / tavily ...
  upstreamUrl: text('upstream_url').notNull(),
  apiKey: text('api_key').notNull(),
  defaultModel: varchar('default_model', { length: 128 }),
  enabled: boolean('enabled').default(true).notNull(),
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
  tier: varchar('tier', { length: 32 }).default('VIP').notNull(),
  // 套餐权益清单（JSON string[]，结算页按选中套餐渲染，见 0004 迁移）
  benefits: text('benefits').default('[]').notNull(),
  // 计费周期：monthly / yearly / lifetime（年费折扣经 original_price_cents 划线价表达）
  billingCycle: varchar('billing_cycle', { length: 16 }).default('yearly').notNull(),
  recommended: boolean('recommended').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
