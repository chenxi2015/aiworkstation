import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { initSchema } from "./schema.ts";
import type { SqliteDatabase } from "./types.ts";

export type { SqliteDatabase };

// Determine database file path (stored in local .aiworkstation directory)
const DB_DIR = path.resolve(process.cwd(), ".aiworkstation");
if (!fs.existsSync(DB_DIR)) {
	fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = path.join(DB_DIR, "workbench.db");

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
