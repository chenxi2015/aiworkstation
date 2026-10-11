import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DB_DIR } from "../db/connection.ts";

/**
 * 平台凭证加密工具（docs/creator-publish-plan.md 红线 3）：
 * - AES-256-GCM，密钥为本机随机生成的 32 字节文件，放数据目录（默认 ~/.aiworkstation/.publish.key）
 * - 密钥文件权限 0600，不进 git（.aiworkstation/ 已 gitignore）
 * - 加解密只发生在 server 层，前端永远只见掩码
 */

const KEY_FILENAME = ".publish.key";

let cachedKey: Buffer | null = null;

function loadOrCreateKey(): Buffer {
	if (cachedKey) return cachedKey;
	const keyPath = path.join(DB_DIR, KEY_FILENAME);
	try {
		if (fs.existsSync(keyPath)) {
			const hex = fs.readFileSync(keyPath, "utf8").trim();
			if (hex.length === 64) {
				cachedKey = Buffer.from(hex, "hex");
				return cachedKey;
			}
		}
	} catch {
		// fallthrough: 重新生成
	}
	const key = randomBytes(32);
	fs.mkdirSync(DB_DIR, { recursive: true });
	fs.writeFileSync(keyPath, key.toString("hex"), { mode: 0o600 });
	cachedKey = key;
	return key;
}

/** 加密 JSON 对象 → base64(iv | authTag | ciphertext) */
export function encryptCredentials(payload: Record<string, unknown>): string {
	const key = loadOrCreateKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const plain = Buffer.from(JSON.stringify(payload), "utf8");
	const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/** 解密 base64(iv | authTag | ciphertext) → JSON 对象 */
export function decryptCredentials(encoded: string): Record<string, unknown> {
	const key = loadOrCreateKey();
	const buf = Buffer.from(encoded, "base64");
	const iv = buf.subarray(0, 12);
	const tag = buf.subarray(12, 28);
	const data = buf.subarray(28);
	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(tag);
	const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
	return JSON.parse(decrypted.toString("utf8")) as Record<string, unknown>;
}

/** 生成给前端看的掩码摘要：appid 明文 + secret 只露尾 4 位 */
export function maskCredentialsHint(
	credentials: Record<string, unknown>,
): string {
	const appid = String(credentials.appid ?? "");
	const secret = String(credentials.appsecret ?? credentials.secret ?? "");
	const tail = secret.length >= 4 ? secret.slice(-4) : "****";
	if (appid && secret) return `appid: ${appid} · secret: ****${tail}`;
	if (appid) return `appid: ${appid}`;
	return "已配置";
}
