import { Hono } from 'hono';
import type { EntitlementsResponse } from '@aiworkstation/shared-types';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../../common/middleware/auth.middleware.js';
import { successJson } from '../../common/response/api-response.js';
import { getDb, schema } from '../../db/index.js';
import {
  getCapabilitiesForTier,
  isMembershipActive,
  normalizeTier,
} from './entitlements.service.js';

export const entitlementsRoutes = new Hono();

/**
 * GET /api/entitlements — 当前用户的权益快照。
 * 客户端仅用于 UI 展示（徽标 / 置灰 / 引导），拦截由网关中间件执行。
 */
entitlementsRoutes.get('/', requireAuth, async (c) => {
  const userId = c.get('userId');
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  if (!user) {
    const empty: EntitlementsResponse = {
      tier: 'FREE',
      memberExpiresAt: null,
      active: false,
      capabilities: [],
    };
    return successJson(c, empty);
  }

  const tier = normalizeTier(user.memberTier);
  const active = isMembershipActive(user.memberTier, user.memberExpiresAt);
  const capabilities = active ? await getCapabilitiesForTier(tier) : [];

  const payload: EntitlementsResponse = {
    tier,
    memberExpiresAt: user.memberExpiresAt?.toISOString() ?? null,
    active,
    capabilities,
  };
  return successJson(c, payload);
});
