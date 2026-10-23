import 'dotenv/config';

/**
 * Server environment configuration with fallback safe defaults
 */
export const env = {
  PORT: Number.parseInt(process.env.PORT || '4000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/aiworkstation',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_jwt_secret_please_change_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // WeChat Open Platform credentials
  WECHAT_APP_ID: process.env.WECHAT_APP_ID || '',
  WECHAT_APP_SECRET: process.env.WECHAT_APP_SECRET || '',
  WECHAT_OAUTH_CALLBACK_URL: process.env.WECHAT_OAUTH_CALLBACK_URL || '',

  // WeChat Pay V3 credentials
  WECHAT_PAY_MCH_ID: process.env.WECHAT_PAY_MCH_ID || '',
  WECHAT_PAY_API_V3_KEY: process.env.WECHAT_PAY_API_V3_KEY || '',
  WECHAT_PAY_SERIAL_NO: process.env.WECHAT_PAY_SERIAL_NO || '',
  WECHAT_PAY_PRIVATE_KEY: process.env.WECHAT_PAY_PRIVATE_KEY || '',
  WECHAT_PAY_PRIVATE_KEY_PATH: process.env.WECHAT_PAY_PRIVATE_KEY_PATH || '',
  WECHAT_PAY_NOTIFY_URL: process.env.WECHAT_PAY_NOTIFY_URL || '',
};

/**
 * Sync environment variables from Cloudflare Workers bindings
 */
export function syncEnv(cfEnv?: Record<string, unknown>) {
  if (!cfEnv || typeof cfEnv !== 'object') return;
  for (const [key, value] of Object.entries(cfEnv)) {
    if (typeof value === 'string') {
      if (key in env) {
        (env as Record<string, unknown>)[key] = key === 'PORT' ? Number.parseInt(value, 10) : value;
      }
      process.env[key] = value;
    }
  }
}

