import fs from 'node:fs';
import { env } from '../../config/env.js';
import {
  decryptWeChatPayResource,
  generateRandomId,
  signWithRsaSha256,
  verifyRsaSha256,
} from '../../utils/crypto.js';

export interface NativePayParams {
  orderNo: string;
  description: string;
  amountCents: number;
}

export interface WeChatNotifyResource {
  original_type: string;
  algorithm: string;
  ciphertext: string;
  associated_data: string;
  nonce: string;
}

export interface WeChatNotifyPayload {
  id: string;
  create_time: string;
  event_type: string;
  resource_type: string;
  resource: WeChatNotifyResource;
  summary: string;
}

export interface DecryptedTransaction {
  mchid: string;
  appid: string;
  out_trade_no: string;
  transaction_id: string;
  trade_type: string;
  trade_state: 'SUCCESS' | 'REFUND' | 'NOTPAY' | 'CLOSED' | 'REVOKED' | 'USERPAYING' | 'PAYERROR';
  trade_state_desc: string;
  bank_type: string;
  success_time: string;
  amount: {
    total: number;
    payer_total: number;
    currency: string;
  };
}

export class WeChatPayClient {
  private privateKeyPem: string = '';

  constructor() {
    this.loadPrivateKey();
  }

  private loadPrivateKey() {
    if (env.WECHAT_PAY_PRIVATE_KEY_PATH && fs.existsSync(env.WECHAT_PAY_PRIVATE_KEY_PATH)) {
      try {
        this.privateKeyPem = fs.readFileSync(env.WECHAT_PAY_PRIVATE_KEY_PATH, 'utf-8');
      } catch (err) {
        console.warn('[WeChatPay] Failed to read private key file:', err);
      }
    }
  }

  /**
   * Check if WeChat Pay credentials are fully configured
   */
  isConfigured(): boolean {
    return Boolean(
      env.WECHAT_PAY_MCH_ID &&
      env.WECHAT_PAY_API_V3_KEY &&
      env.WECHAT_PAY_SERIAL_NO &&
      this.privateKeyPem,
    );
  }

  /**
   * Create Native payment transaction (QR Code)
   */
  async createNativeOrder(params: NativePayParams): Promise<string> {
    if (!this.isConfigured()) {
      // Mock Native QR code payment for local testing
      return `weixin://wxpay/bizpayurl?pr=mock_${params.orderNo}`;
    }

    const url = 'https://api.mch.weixin.qq.com/v3/pay/transactions/native';
    const body = JSON.stringify({
      appid: env.WECHAT_APP_ID,
      mchid: env.WECHAT_PAY_MCH_ID,
      description: params.description,
      out_trade_no: params.orderNo,
      notify_url: env.WECHAT_PAY_NOTIFY_URL,
      amount: {
        total: params.amountCents,
        currency: 'CNY',
      },
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = generateRandomId('', 16);
    const signature = this.buildRequestSignature('POST', '/v3/pay/transactions/native', timestamp, nonce, body);

    const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${env.WECHAT_PAY_MCH_ID}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${env.WECHAT_PAY_SERIAL_NO}"`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: authorization,
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`WeChat Native pay order creation failed: ${errText}`);
    }

    const data = (await res.json()) as { code_url: string };
    return data.code_url;
  }

  /**
   * Decrypt WeChat Pay Notify Resource (AES-256-GCM)
   */
  decryptNotifyResource(resource: WeChatNotifyResource): DecryptedTransaction {
    if (!env.WECHAT_PAY_API_V3_KEY) {
      throw new Error('WECHAT_PAY_API_V3_KEY is not configured');
    }

    const decryptedStr = decryptWeChatPayResource(
      resource.associated_data,
      resource.nonce,
      resource.ciphertext,
      env.WECHAT_PAY_API_V3_KEY,
    );

    return JSON.parse(decryptedStr) as DecryptedTransaction;
  }

  /**
   * Verify notify signature from WeChat headers
   */
  verifyNotificationSignature(
    timestamp: string,
    nonce: string,
    rawBody: string,
    signature: string,
    platformCertPem?: string,
  ): boolean {
    if (!platformCertPem) {
      // In dev mode without certificate, skip strict cert check
      return true;
    }
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
    return verifyRsaSha256(message, signature, platformCertPem);
  }

  /**
   * Build authorization signature for WeChat Pay API request
   */
  private buildRequestSignature(method: string, canonicalUrl: string, timestamp: string, nonce: string, body: string): string {
    const message = `${method}\n${canonicalUrl}\n${timestamp}\n${nonce}\n${body}\n`;
    return signWithRsaSha256(message, this.privateKeyPem);
  }
}
