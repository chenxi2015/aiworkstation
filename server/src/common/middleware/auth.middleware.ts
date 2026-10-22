import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { type CapabilityId, ErrorCode } from '@aiworkstation/shared-types';
import { getDb, schema } from '../../db/index.js';
import {
  getCapabilitiesForTier,
  isMembershipActive,
  normalizeTier,
} from '../../modules/entitlements/entitlements.service.js';
import { verifyJwtToken } from '../../utils/crypto.js';
import { errorJson } from '../response/api-response.js';

// Extend Hono Context Variables for auth
declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    openid: string;
  }
}

/**
 * Require valid JWT authentication middleware
 */
export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorJson(c, 'Authentication required. Please login first.', ErrorCode.UNAUTHORIZED, 401);
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyJwtToken(token);
  if (!payload) {
    return errorJson(c, 'Invalid or expired token. Please login again.', ErrorCode.UNAUTHORIZED, 401);
  }

  c.set('userId', payload.userId);
  c.set('openid', payload.openid);

  await next();
}

/**
 * 能力门禁中间件工厂：校验当前会员档位是否被授予指定能力。
 * 档位 → 能力映射存 tier_entitlements 表（数据驱动，本文件不含任何
 * 固定档位比较逻辑）；LIFETIME 永久有效、其余档位看 memberExpiresAt，
 * 该规则集中在 entitlements.service.ts。
 *
 * 拒绝时按场景返回结构化错误码（message 内含机器可读码，供客户端透传）：
 * - MEMBERSHIP_REQUIRED：从未购买会员
 * - MEMBERSHIP_EXPIRED：会员已到期，需续费
 * - CAPABILITY_NOT_ENTITLED：档位不覆盖该能力（如 VIP 调视觉），需升级
 *
 * Must run after requireAuth so `userId` is available in context.
 */
export function requireCapability(capability: CapabilityId) {
  return async (c: Context, next: Next) => {
    const userId = c.get('userId');
    if (!userId) {
      return errorJson(c, 'Authentication required. Please login first.', ErrorCode.UNAUTHORIZED, 401);
    }

    const db = getDb();
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    const tier = normalizeTier(user?.memberTier ?? 'FREE');

    if (tier === 'FREE') {
      return errorJson(
        c,
        `MEMBERSHIP_REQUIRED: 官方极速通道为会员专享服务，请先开通会员（能力: ${capability}）`,
        ErrorCode.MEMBERSHIP_REQUIRED,
        403,
      );
    }

    if (!isMembershipActive(user?.memberTier ?? 'FREE', user?.memberExpiresAt ?? null)) {
      return errorJson(
        c,
        `MEMBERSHIP_EXPIRED: 会员已到期，续费后即可继续使用官方极速通道（能力: ${capability}）`,
        ErrorCode.MEMBERSHIP_EXPIRED,
        403,
      );
    }

    const capabilities = await getCapabilitiesForTier(tier);
    if (!capabilities.includes(capability)) {
      return errorJson(
        c,
        `CAPABILITY_NOT_ENTITLED: 当前会员档位不包含「${capability}」能力，升级档位即可解锁`,
        ErrorCode.CAPABILITY_NOT_ENTITLED,
        403,
      );
    }

    await next();
  };
}

/**
 * Backward-compatible alias: chat 能力的会员门禁。
 * @deprecated 新路由请使用 requireCapability('<capability>')
 */
export const requireMemberAuth = requireCapability('chat');
