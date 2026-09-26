import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { initSchema } from "./schema.ts";
import type { SqliteDatabase } from "./types.ts";

export type { SqliteDatabase };

// Determine database directory:
// 1. In Electron or custom environments: use AIWORKSTATION_DATA_DIR
// 2. Otherwise fall back to local .aiworkstation directory under process.cwd()
function resolveDbDir(): string {
	const customDir = process.env.AIWORKSTATION_DATA_DIR?.trim();
	if (customDir) {
		return path.resolve(customDir);
	}
	return path.resolve(process.cwd(), ".aiworkstation");
}

export const DB_DIR = resolveDbDir();
try {
	if (!fs.existsSync(DB_DIR)) {
		fs.mkdirSync(DB_DIR, { recursive: true });
	}
} catch (error) {
	console.error("[SQLite] Failed to ensure database directory exists:", DB_DIR, error);
}
export const DB_PATH = path.join(DB_DIR, "workbench.db");

let dbInstance: SqliteDatabase | null = null;

/**
 * Get or initialize SQLite Database connection singleton
 */
export function getDb(): SqliteDatabase {
	if (!dbInstance) {
		dbInstance = new Database(DB_PATH, { timeout: 5000 });
		dbInstance.pragma("journal_mode = WAL");
		dbInstance.pragma("busy_timeout = 5000");
		dbInstance.pragma("foreign_keys = ON");
		initSchema(dbInstance);
	}
	return dbInstance;
}

/**
 * Close SQLite Database connection singleton and checkpoint WAL to disk
 */
export function closeDb(): void {
	if (dbInstance) {
		try {
			// Checkpoint WAL first to flush all pending transactions to disk
			dbInstance.pragma("wal_checkpoint(TRUNCATE)");
			dbInstance.close();
		} catch (error) {
			console.error("[SQLite] Failed to close database connection:", error);
		} finally {
			dbInstance = null;
		}
	}
}

