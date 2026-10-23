import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { getDb, schema } from './index.js';

/**
 * 启动种子：当云端 PostgreSQL official_channels 表的 api_key 为空时，
 * 直接从本地 SQLite 数据库（~/.aiworkstation/workbench.db 的 ai_channel_configs 表）
 * 读取对应上游服务商的密钥回填到云端表，彻底不依赖任何 env / .dev.vars 环境变量。
 */
const SQLITE_PROVIDER_SOURCES: Array<{
  capability: string;
  sourceCapability: string;
  provider: string;
}> = [
  { capability: 'chat', sourceCapability: 'chat', provider: 'deepseek' },
  { capability: 'vision', sourceCapability: 'chat', provider: 'deepseek' },
  { capability: 'embedding', sourceCapability: 'embedding', provider: 'siliconflow' },
  { capability: 'image_gen', sourceCapability: 'image_gen', provider: 'doubao' },
  { capability: 'web_search', sourceCapability: 'web_search', provider: 'tavily' },
];

async function readKeysFromLocalSqlite(): Promise<Map<string, string>> {
  const keys = new Map<string, string>();
  const dbPath = path.join(os.homedir(), '.aiworkstation', 'workbench.db');
  if (!fs.existsSync(dbPath)) return keys;

  try {
    const Database = (await import('better-sqlite3')).default;
    const sqlite = new Database(dbPath, { readonly: true });
    const stmt = sqlite.prepare(
      "SELECT api_key FROM ai_channel_configs WHERE capability = ? AND provider = ? AND channel = 'custom' AND api_key != '' LIMIT 1",
    );
    for (const item of SQLITE_PROVIDER_SOURCES) {
      const row = stmt.get(item.sourceCapability, item.provider) as { api_key?: string } | undefined;
      const key = row?.api_key?.trim();
      if (key) {
        keys.set(item.capability, key);
      }
    }
    sqlite.close();
  } catch {
    // Local SQLite unavailable in cloud runtime; official_channels table is already populated
  }
  return keys;
}

export async function runStartupSeed(): Promise<void> {
  try {
    const localKeys = await readKeysFromLocalSqlite();
    if (localKeys.size === 0) return;

    const db = getDb();
    for (const [capability, key] of localKeys.entries()) {
      await db
        .update(schema.officialChannels)
        .set({ apiKey: key, updatedAt: new Date() })
        .where(
          sql`${schema.officialChannels.capability} = ${capability} AND (${schema.officialChannels.apiKey} = '' OR ${schema.officialChannels.apiKey} IS NULL)`,
        );
    }
    console.log('[StartupSeed] official_channels key sync from database completed.');
  } catch (err) {
    console.warn('[StartupSeed] skipped:', err instanceof Error ? err.message : err);
  }
}
