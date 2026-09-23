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
 */
export type MemberTier = 'FREE' | 'PRO' | 'LIFETIME';
