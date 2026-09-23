import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
import type { QrCheckResponse, QrTicketResponse, UserProfile } from '@aiworkstation/shared-types';
import { env } from '../../config/env.js';
import { getDb, schema } from '../../db/index.js';
import { generateRandomId, signJwtToken } from '../../utils/crypto.js';

// Fallback in-memory ticket store when database is not yet connected
const inMemoryTickets = new Map<string, { status: string; userId?: string; token?: string; expiresAt: number }>();

export class AuthService {
  /**
   * Create a new QR ticket session for WeChat scan login
   */
  async createQrTicket(): Promise<QrTicketResponse> {
    const ticket = generateRandomId('tkt', 24);
    const expiresInSeconds = 300; // 5 minutes
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    // Build WeChat QR Connect URL if configured, otherwise provide dev mock URL
    let authUrl = '';
    if (env.WECHAT_APP_ID && env.WECHAT_OAUTH_CALLBACK_URL) {
      const redirectUri = encodeURIComponent(env.WECHAT_OAUTH_CALLBACK_URL);
      authUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${env.WECHAT_APP_ID}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_login&state=${ticket}#wechat_redirect`;
    } else {
      // Local dev simulation URL
      authUrl = `http://${env.HOST}:${env.PORT}/api/auth/wx/mock-scan?state=${ticket}`;
    }

    // Generate Base64 QR code image
    const qrCodeUrl = await QRCode.toDataURL(authUrl, {
      margin: 2,
      width: 260,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    try {
      const db = getDb();
      await db.insert(schema.authTickets).values({
        ticket,
        status: 'PENDING',
        expiresAt,
      });
    } catch {
      // Graceful fallback to memory store
      inMemoryTickets.set(ticket, { status: 'PENDING', expiresAt: expiresAt.getTime() });
    }

    return {
      ticket,
      qrCodeUrl,
      expiresInSeconds,
    };
  }

  /**
   * Handle OAuth callback from WeChat after user scans and confirms
   */
  async handleCallback(code: string, state: string): Promise<string> {
    const ticket = state;
    let openid = '';
    let unionid: string | undefined;
    let nickname = 'WeChat User';
    let avatarUrl = '';

    if (env.WECHAT_APP_ID && env.WECHAT_APP_SECRET) {
      // Exchange code for access_token and openid with WeChat API
      const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${env.WECHAT_APP_ID}&secret=${env.WECHAT_APP_SECRET}&code=${code}&grant_type=authorization_code`;
      const res = await fetch(tokenUrl);
      const data = (await res.json()) as { openid?: string; unionid?: string; access_token?: string; errcode?: number; errmsg?: string };

      if (!data.openid) {
        throw new Error(`WeChat OAuth error: ${data.errmsg || 'Failed to exchange token'}`);
      }

      openid = data.openid;
      unionid = data.unionid;

      // Fetch user profile from WeChat
      if (data.access_token) {
        const userRes = await fetch(`https://api.weixin.qq.com/sns/userinfo?access_token=${data.access_token}&openid=${openid}`);
        const userData = (await userRes.json()) as { nickname?: string; headimgurl?: string };
        if (userData.nickname) nickname = userData.nickname;
        if (userData.headimgurl) avatarUrl = userData.headimgurl;
      }
    } else {
      // Mock user for development
      openid = `mock_wx_${generateRandomId('', 8)}`;
      nickname = 'Developer Preview';
    }

    // Upsert user into database
    let userId = '';
    try {
      const db = getDb();
      const existingUser = await db.query.users.findFirst({
        where: eq(schema.users.openid, openid),
      });

      if (existingUser) {
        userId = existingUser.id;
        await db.update(schema.users).set({
          nickname,
          avatarUrl,
          updatedAt: new Date(),
        }).where(eq(schema.users.id, userId));
      } else {
        userId = generateRandomId('usr', 16);
        await db.insert(schema.users).values({
          id: userId,
          openid,
          unionid,
          nickname,
          avatarUrl,
          memberTier: 'FREE',
        });
      }

      const token = signJwtToken({ userId, openid });

      // Update ticket status
      await db.update(schema.authTickets).set({
        status: 'CONFIRMED',
        userId,
        token,
      }).where(eq(schema.authTickets.ticket, ticket));

      return token;
    } catch {
      // Fallback in-memory
      userId = `usr_${openid}`;
      const token = signJwtToken({ userId, openid });
      inMemoryTickets.set(ticket, {
        status: 'CONFIRMED',
        userId,
        token,
        expiresAt: Date.now() + 300000,
      });
      return token;
    }
  }

  /**
   * Poll ticket status by client
   */
  async checkTicket(ticket: string): Promise<QrCheckResponse> {
    try {
      const db = getDb();
      const ticketRecord = await db.query.authTickets.findFirst({
        where: eq(schema.authTickets.ticket, ticket),
      });

      if (!ticketRecord) {
        const mem = inMemoryTickets.get(ticket);
        if (mem) {
          if (Date.now() > mem.expiresAt) return { status: 'EXPIRED' };
          if (mem.status === 'CONFIRMED' && mem.userId && mem.token) {
            return {
              status: 'CONFIRMED',
              token: mem.token,
              user: {
                id: mem.userId,
                nickname: 'Developer Preview',
                avatarUrl: '',
                memberTier: 'FREE',
                memberExpiresAt: null,
                createdAt: new Date().toISOString(),
              },
            };
          }
          return { status: mem.status as QrCheckResponse['status'] };
        }
        return { status: 'EXPIRED' };
      }

      if (new Date() > ticketRecord.expiresAt) {
        return { status: 'EXPIRED' };
      }

      if (ticketRecord.status === 'CONFIRMED' && ticketRecord.userId && ticketRecord.token) {
        const user = await this.getUserProfile(ticketRecord.userId);
        return {
          status: 'CONFIRMED',
          token: ticketRecord.token,
          user: user || undefined,
        };
      }

      return { status: ticketRecord.status as QrCheckResponse['status'] };
    } catch {
      const mem = inMemoryTickets.get(ticket);
      if (mem && mem.status === 'CONFIRMED' && mem.userId && mem.token) {
        return {
          status: 'CONFIRMED',
          token: mem.token,
          user: {
            id: mem.userId,
            nickname: 'Developer Preview',
            avatarUrl: '',
            memberTier: 'FREE',
            memberExpiresAt: null,
            createdAt: new Date().toISOString(),
          },
        };
      }
      return { status: 'PENDING' };
    }
  }

  /**
   * Get user public profile and membership info
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const db = getDb();
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
      });
      if (!user) return null;

      return {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        memberTier: user.memberTier as UserProfile['memberTier'],
        memberExpiresAt: user.memberExpiresAt ? user.memberExpiresAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
      };
    } catch {
      return {
        id: userId,
        nickname: 'Developer Preview',
        avatarUrl: '',
        memberTier: 'FREE',
        memberExpiresAt: null,
        createdAt: new Date().toISOString(),
      };
    }
  }
}
