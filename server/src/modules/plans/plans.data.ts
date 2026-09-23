import { asc, eq } from 'drizzle-orm';
import type { SubscriptionPlan } from '@aiworkstation/shared-types';
import { getDb, schema } from '../../db/index.js';

/**
 * Default fallback subscription plans (Seeded into DB on first launch)
 */
export const DEFAULT_PLANS: (SubscriptionPlan & { sortOrder: number })[] = [
  {
    id: 'plan_pro_yearly',
    name: '工作台年度会员',
    description: '解锁本地优先 AI 创作、无限知识库问答与云端同步（365天无限畅享）',
    priceCents: 3600, // ¥36.00 / 年
    originalPriceCents: 19900, // 原价 ¥199.00
    durationDays: 365,
    tier: 'PRO',
    recommended: true,
    sortOrder: 1,
  },
  {
    id: 'plan_lifetime',
    name: '终身创始特权',
    description: '一次买断，永久享受所有当前及未来 AI 创作与工作台核心能力',
    priceCents: 29900, // ¥299.00
    originalPriceCents: 99900,
    durationDays: 36500, // 100 years
    tier: 'LIFETIME',
    recommended: false,
    sortOrder: 2,
  },
];

/**
 * Seed default plans into database if table is empty
 */
export async function seedPlansIfEmpty(): Promise<void> {
  try {
    const db = getDb();
    const existing = await db.select().from(schema.subscriptionPlans).limit(1);
    if (existing.length === 0) {
      console.log('[Plans] Seeding default plans into database...');
      for (const p of DEFAULT_PLANS) {
        await db.insert(schema.subscriptionPlans).values({
          id: p.id,
          name: p.name,
          description: p.description,
          priceCents: p.priceCents,
          originalPriceCents: p.originalPriceCents,
          durationDays: p.durationDays,
          tier: p.tier,
          recommended: p.recommended ?? false,
          sortOrder: p.sortOrder,
          isActive: true,
        });
      }
      console.log('[Plans] Default plans seeded successfully (Yearly ¥36).');
    }
  } catch (err) {
    console.warn('[Plans] Skip DB seed (using memory fallback):', (err as Error).message);
  }
}

/**
 * Retrieve active subscription plans from database, falling back to memory
 */
export async function getPlansFromDb(): Promise<SubscriptionPlan[]> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.isActive, true))
      .orderBy(asc(schema.subscriptionPlans.sortOrder));

    if (rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        priceCents: r.priceCents,
        originalPriceCents: r.originalPriceCents,
        durationDays: r.durationDays,
        tier: r.tier as 'FREE' | 'PRO' | 'LIFETIME',
        recommended: r.recommended,
      }));
    }
  } catch {
    // Fall back to in-memory plans on DB connection failure
  }

  return DEFAULT_PLANS.map(({ sortOrder: _, ...rest }) => rest);
}

/**
 * Find plan by its unique ID from database, falling back to memory
 */
export async function getPlanByIdFromDb(planId: string): Promise<SubscriptionPlan | undefined> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);

    if (rows.length > 0) {
      const r = rows[0];
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        priceCents: r.priceCents,
        originalPriceCents: r.originalPriceCents,
        durationDays: r.durationDays,
        tier: r.tier as 'FREE' | 'PRO' | 'LIFETIME',
        recommended: r.recommended,
      };
    }
  } catch {
    // Fall back to in-memory plans
  }

  return DEFAULT_PLANS.find((p) => p.id === planId);
}

/**
 * Synchronous memory fallback
 */
export function getPlanById(planId: string): SubscriptionPlan | undefined {
  return DEFAULT_PLANS.find((p) => p.id === planId);
}
