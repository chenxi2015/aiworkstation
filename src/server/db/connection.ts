import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { initSchema } from "./schema.ts";
import type { SqliteDatabase } from "./types.ts";

export type { SqliteDatabase };

// Determine database directory:
// 1. In custom environments or explicit overrides: use AIWORKSTATION_DATA_DIR
// 2. Otherwise default to user's home directory: ~/.aiworkstation (/Users/<user>/.aiworkstation)
//    This ensures data persistence across application upgrades/uninstalls and avoids permission issues.
function resolveDbDir(): string {
	const customDir = process.env.AIWORKSTATION_DATA_DIR?.trim();
	if (customDir) {
		return path.resolve(customDir);
	}
	return path.join(os.homedir(), ".aiworkstation");
}

export const DB_DIR = resolveDbDir();

/**
 * Ensure database directory exists and migrate legacy data if needed.
 * If target DB is non-existent or empty, copy from legacy project-local .aiworkstation.
 */
function ensureDataDirAndMigrate(): void {
	try {
		if (!fs.existsSync(DB_DIR)) {
			fs.mkdirSync(DB_DIR, { recursive: true });
		}

		const targetDbPath = path.join(DB_DIR, "workbench.db");
		const targetDbExists = fs.existsSync(targetDbPath);
		const targetDbSize = targetDbExists ? fs.statSync(targetDbPath).size : 0;

		// If target database doesn't exist or is an empty 0-byte placeholder
		if (!targetDbExists || targetDbSize === 0) {
			const legacyDir = path.resolve(process.cwd(), ".aiworkstation");
			const legacyDbPath = path.join(legacyDir, "workbench.db");

			if (legacyDir !== DB_DIR && fs.existsSync(legacyDbPath)) {
				const legacySize = fs.statSync(legacyDbPath).size;
				if (legacySize > 0) {
					console.log(
						`[SQLite] Migrating legacy data from ${legacyDir} to ${DB_DIR}...`,
					);
					fs.copyFileSync(legacyDbPath, targetDbPath);

					if (fs.existsSync(`${legacyDbPath}-wal`)) {
						fs.copyFileSync(`${legacyDbPath}-wal`, `${targetDbPath}-wal`);
					}
					if (fs.existsSync(`${legacyDbPath}-shm`)) {
						fs.copyFileSync(`${legacyDbPath}-shm`, `${targetDbPath}-shm`);
					}

					// Copy auxiliary assets if target directories don't exist yet
					const legacyPages = path.join(legacyDir, "pages");
					const targetPages = path.join(DB_DIR, "pages");
					if (fs.existsSync(legacyPages) && !fs.existsSync(targetPages)) {
						fs.cpSync(legacyPages, targetPages, { recursive: true });
					}

					const legacyBackups = path.join(legacyDir, "backups");
					const targetBackups = path.join(DB_DIR, "backups");
					if (fs.existsSync(legacyBackups) && !fs.existsSync(targetBackups)) {
						fs.cpSync(legacyBackups, targetBackups, { recursive: true });
					}

					const legacyScan = path.join(legacyDir, "dead-link-scan.json");
					const targetScan = path.join(DB_DIR, "dead-link-scan.json");
					if (fs.existsSync(legacyScan) && !fs.existsSync(targetScan)) {
						fs.copyFileSync(legacyScan, targetScan);
					}

					console.log(
						`[SQLite] Migration completed successfully (${legacySize} bytes).`,
					);
				}
			}
		}
	} catch (error) {
		console.error(
			"[SQLite] Failed to ensure database directory exists or migrate legacy data:",
			DB_DIR,
			error,
		);
	}
}

ensureDataDirAndMigrate();
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
