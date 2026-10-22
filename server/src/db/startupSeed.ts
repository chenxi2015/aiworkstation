import { sql } from 'drizzle-orm';
import { getDb, schema } from './index.js';

/**
 * 启动种子：official_channels 的 api_key 为空时从 env 回填（迁移期兼容路径）。
 * 目标态是上游 key 全部由运维直接写入 official_channels 表，env 仅作首次种子来源。
 *
 * env 变量（仅作种子，不是运行时依赖）：
 * - OFFICIAL_DEEPSEEK_KEY    → chat / vision
 * - OFFICIAL_EMBEDDING_KEY   → embedding（SiliconFlow）
 * - OFFICIAL_IMAGE_KEY       → image_gen（火山方舟）
 * - OFFICIAL_SEARCH_KEY      → web_search（Tavily）
 */
const SEED_KEY_SOURCES: Array<{ capability: string; envKey: string }> = [
  { capability: 'chat', envKey: 'OFFICIAL_DEEPSEEK_KEY' },
  { capability: 'vision', envKey: 'OFFICIAL_DEEPSEEK_KEY' },
  { capability: 'embedding', envKey: 'OFFICIAL_EMBEDDING_KEY' },
  { capability: 'image_gen', envKey: 'OFFICIAL_IMAGE_KEY' },
  { capability: 'web_search', envKey: 'OFFICIAL_SEARCH_KEY' },
];

export async function runStartupSeed(): Promise<void> {
  try {
    const db = getDb();
    for (const { capability, envKey } of SEED_KEY_SOURCES) {
      const key = (process.env[envKey] || '').trim();
      if (!key) continue;
      await db
        .update(schema.officialChannels)
        .set({ apiKey: key, updatedAt: new Date() })
        .where(
          sql`${schema.officialChannels.capability} = ${capability} AND (${schema.officialChannels.apiKey} = '' OR ${schema.officialChannels.apiKey} IS NULL)`,
        );
    }
    console.log('[StartupSeed] official_channels key backfill completed.');
  } catch (err) {
    // 表可能尚未迁移（首次部署先跑 db:migrate），不阻断启动
    console.warn('[StartupSeed] skipped:', err instanceof Error ? err.message : err);
  }
}
