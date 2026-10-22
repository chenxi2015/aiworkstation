/**
 * WeChat QR login status
 */
export type QrLoginStatus = 'PENDING' | 'SCANNED' | 'CONFIRMED' | 'EXPIRED';

/**
 * QR code ticket response for client polling
 */
export interface QrTicketResponse {
  ticket: string;
  qrCodeUrl: string;
  expiresInSeconds: number;
}

/**
 * Login polling response
 */
export interface QrCheckResponse {
  status: QrLoginStatus;
  token?: string;
  user?: UserProfile;
}

/**
 * User public profile
 */
export interface UserProfile {
  id: string;
  nickname: string;
  avatarUrl: string;
  memberTier: MemberTier;
  memberExpiresAt: string | null;
  createdAt: string;
}

/**
 * Membership tier types
 * - FREE: 无官方通道权益（可自备 API Key）
 * - VIP: 对话模型 + 向量 + 联网搜索
 * - SVIP: VIP 全部 + 视觉模型 / 生图（更贵）
 * - LIFETIME: 全部能力，无到期
 * - PRO: 已废弃的历史档位，等价于 VIP（迁移期保留兼容）
 */
export type MemberTier = 'FREE' | 'VIP' | 'SVIP' | 'LIFETIME' | 'PRO';

/**
 * AI 能力标识（官方通道按能力做权益门禁）
 */
export type CapabilityId =
  | 'chat'
  | 'vision'
  | 'embedding'
  | 'web_search'
  | 'image_gen'
  | 'video_gen';

/**
 * 权益快照：GET /api/entitlements 的响应载荷。
 * 客户端仅用于 UI 展示（徽标/置灰/引导），不作拦截依据。
 */
export interface EntitlementsResponse {
  tier: MemberTier;
  memberExpiresAt: string | null;
  /** 会员当前是否处于有效期 */
  active: boolean;
  /** 当前档位可用的官方通道能力 */
  capabilities: CapabilityId[];
}
