import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface JwtPayload {
  userId: string;
  openid: string;
}

/**
 * Sign JWT token for user session
 */
export function signJwtToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Verify and decode JWT token
 */
export function verifyJwtToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Generate a cryptographically secure random string ID
 */
export function generateRandomId(prefix = '', length = 16): string {
  const bytes = crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  return prefix ? `${prefix}_${bytes}` : bytes;
}

/**
 * WeChat Pay V3: Decrypt AES-256-GCM ciphertext from notify webhook
 */
export function decryptWeChatPayResource(
  associatedData: string,
  nonce: string,
  ciphertext: string,
  apiV3Key: string,
): string {
  const ciphertextBuffer = Buffer.from(ciphertext, 'base64');
  const authTag = ciphertextBuffer.subarray(ciphertextBuffer.length - 16);
  const encryptedData = ciphertextBuffer.subarray(0, ciphertextBuffer.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf-8'), Buffer.from(nonce, 'utf-8'));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(associatedData, 'utf-8'));

  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * WeChat Pay V3: Generate RSA-SHA256 signature for API requests
 */
export function signWithRsaSha256(message: string, privateKeyPem: string): string {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  return signer.sign(privateKeyPem, 'base64');
}

/**
 * WeChat Pay V3: Verify RSA-SHA256 signature from WeChat notification headers
 */
export function verifyRsaSha256(message: string, signatureBase64: string, certificatePublicKeyPem: string): boolean {
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(message);
    return verifier.verify(certificatePublicKeyPem, signatureBase64, 'base64');
  } catch {
    return false;
  }
}
