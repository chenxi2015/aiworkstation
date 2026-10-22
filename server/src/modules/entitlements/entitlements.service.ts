import { and, eq } from 'drizzle-orm';
import type { CapabilityId, MemberTier } from '@aiworkstation/shared-types';
import { getDb, schema } from '../../db/index.js';

/**
 * 会员权益判定服务（云端唯一事实源）。
 * 档位 → 能力的映射存 tier_entitlements 表；本地客户端永不自行判定。
 */

/** 历史 PRO 档位等价于 VIP（迁移期兼容） */
export function normalizeTier(tier: string): MemberTier {
  if (tier === 'PRO') return 'VIP';
  if (tier === 'VIP' || tier === 'SVIP' || tier === 'LIFETIME') return tier;
  return 'FREE';
}

/** 会员当前是否处于有效期（LIFETIME 永久有效；其余档位看过期时间） */
export function isMembershipActive(
  tier: string,
  memberExpiresAt: Date | null,
): boolean {
  const normalized = normalizeTier(tier);
  if (normalized === 'FREE') return false;
  if (normalized === 'LIFETIME') return true;
  return !!memberExpiresAt && memberExpiresAt.getTime() > Date.now();
}

/** 查询某档位被授予的能力列表 */
export async function getCapabilitiesForTier(
  tier: string,
): Promise<CapabilityId[]> {
  const normalized = normalizeTier(tier);
  if (normalized === 'FREE') return [];
  const db = getDb();
  const rows = await db
    .select({ capability: schema.tierEntitlements.capability })
    .from(schema.tierEntitlements)
    .where(eq(schema.tierEntitlements.tier, normalized));
  return rows.map((r) => r.capability as CapabilityId);
}

/** 判定用户对某能力是否有权使用官方通道 */
export async function hasCapabilityEntitlement(
  tier: string,
  memberExpiresAt: Date | null,
  capability: CapabilityId,
): Promise<boolean> {
  if (!isMembershipActive(tier, memberExpiresAt)) return false;
  const capabilities = await getCapabilitiesForTier(tier);
  return capabilities.includes(capability);
}

/** 查询某能力的官方通道上游配置 */
export async function getOfficialChannel(capability: CapabilityId) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.officialChannels)
    .where(
      and(
        eq(schema.officialChannels.capability, capability),
        eq(schema.officialChannels.enabled, true),
      ),
    )
    .limit(1);
  // api_key 为空视为未配置（种子行的占位态）
  const row = rows[0];
  return row && row.apiKey.trim() ? row : null;
}
