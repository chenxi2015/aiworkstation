import { z } from 'zod';

/**
 * Schema for WeChat OAuth callback query parameters
 */
export const wechatCallbackQuerySchema = z.object({
  code: z.string({ required_error: 'Missing code parameter' }).min(1, 'Code parameter cannot be empty'),
  state: z.string({ required_error: 'Missing state parameter' }).min(1, 'State parameter cannot be empty'),
});

export type WechatCallbackQuery = z.infer<typeof wechatCallbackQuerySchema>;

/**
 * Schema for local development mock scan query parameters
 */
export const mockScanQuerySchema = z.object({
  state: z.string({ required_error: 'Missing state parameter' }).min(1, 'State parameter cannot be empty'),
});

export type MockScanQuery = z.infer<typeof mockScanQuerySchema>;

/**
 * Schema for polling QR ticket status query parameters
 */
export const checkTicketQuerySchema = z.object({
  ticket: z.string({ required_error: 'Missing ticket parameter' }).min(1, 'Ticket parameter cannot be empty'),
});

export type CheckTicketQuery = z.infer<typeof checkTicketQuerySchema>;
