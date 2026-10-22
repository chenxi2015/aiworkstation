import { asc, eq } from 'drizzle-orm';
import type { MemberTier, SubscriptionPlan } from '@aiworkstation/shared-types';
import { getDb, schema } from '../../db/index.js';

/** 解析套餐权益清单 JSON（脏数据回退为空数组） */
function parseBenefits(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

/**
 * Retrieve active subscription plans directly from the database
 */
export async function getPlansFromDb(): Promise<SubscriptionPlan[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.isActive, true))
    .orderBy(asc(schema.subscriptionPlans.sortOrder));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    priceCents: r.priceCents,
    originalPriceCents: r.originalPriceCents,
    durationDays: r.durationDays,
    tier: r.tier as MemberTier,
    recommended: r.recommended,
    benefits: parseBenefits(r.benefits),
    billingCycle: (r.billingCycle || 'yearly') as SubscriptionPlan['billingCycle'],
  }));
}

/**
 * Find subscription plan by unique ID directly from the database
 */
export async function getPlanByIdFromDb(planId: string): Promise<SubscriptionPlan | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const r = rows[0];
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    priceCents: r.priceCents,
    originalPriceCents: r.originalPriceCents,
    durationDays: r.durationDays,
    tier: r.tier as MemberTier,
    recommended: r.recommended,
    benefits: parseBenefits(r.benefits),
    billingCycle: (r.billingCycle || 'yearly') as SubscriptionPlan['billingCycle'],
  };
}

/**
 * Query plan by ID directly from database (alias)
 */
export const getPlanById = getPlanByIdFromDb;
