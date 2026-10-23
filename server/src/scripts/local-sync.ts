import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Update local SQLite workbench.db settings if available
 */
export async function syncToLocalWorkbenchSqlite(cloudToken: string, cloudApiBase = 'http://localhost:4000') {
  const possiblePaths = [
    path.join(os.homedir(), '.aiworkstation', 'workbench.db'),
    path.resolve(process.cwd(), '.aiworkstation', 'workbench.db'),
    path.resolve(process.cwd(), '..', '.aiworkstation', 'workbench.db'),
  ];

  for (const dbPath of possiblePaths) {
    if (!fs.existsSync(dbPath)) continue;

    try {
      // Dynamic import to avoid hard bundling requirements
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath);

      // 1. Update workbench_settings
      const row = db.prepare("SELECT value FROM settings WHERE key = 'workbench_settings'").get() as
        | { value: string }
        | undefined;
      const current = row?.value ? (JSON.parse(row.value) as Record<string, unknown>) : {};
      const updated = {
        ...current,
        cloudToken,
        cloudApiBase,
      };

      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('workbench_settings', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(JSON.stringify(updated), now);

      // 2. Ensure official AI channel is active for chat
      try {
        db.prepare("UPDATE ai_channel_configs SET is_active = 0 WHERE capability = 'chat'").run();
        const officialRow = db
          .prepare("SELECT id FROM ai_channel_configs WHERE capability = 'chat' AND channel = 'official'")
          .get() as { id: number } | undefined;

        if (officialRow) {
          db.prepare("UPDATE ai_channel_configs SET is_active = 1, updated_at = ? WHERE id = ?").run(
            now,
            officialRow.id,
          );
        } else {
          db.prepare(`
            INSERT INTO ai_channel_configs (capability, channel, provider, label, api_key, base_url, model, extra, is_active, created_at, updated_at)
            VALUES ('chat', 'official', 'official', '官方极速通道', '', '', 'deepseek-chat', '{}', 1, ?, ?)
          `).run(now, now);
        }
      } catch {
        // Table may not exist yet in legacy db, safe to ignore
      }

      db.close();
      console.log(`[Local Sync] Successfully updated local SQLite at: ${dbPath}`);
    } catch (err) {
      console.warn(`[Local Sync] Failed to update local SQLite at ${dbPath}:`, err instanceof Error ? err.message : err);
    }
  }
}

