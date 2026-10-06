import { app } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Application metadata and branding configurations
 */
export const APP_CONFIG = {
	ID: "com.aiworkstation.app",
	NAME: "AI Workstation",
	SLUG: "AI-Workstation",
	COPYRIGHT: "Copyright © 2026",
	CATEGORY: "public.app-category.productivity",
} as const;

/**
 * Runtime environment flag (safe across Electron and Node.js environments)
 */
export const isDev =
	typeof app !== "undefined" && app !== null
		? !app.isPackaged
		: process.env.NODE_ENV !== "production";

/**
 * Network and local server configurations
 */
export const SERVER_CONFIG = {
	HOST: "127.0.0.1",
	DEFAULT_PORT: 3888,
	STARTUP_TIMEOUT_MS: 15_000,
} as const;

export { REPO_CONFIG } from "../src/config/app.ts";

/**
 * Main window dimensional constraints
 */
export const WINDOW_CONFIG = {
	OPTIMAL_WIDTH: 1580,
	OPTIMAL_HEIGHT: 860,
	MIN_WIDTH: 1366,
	MIN_HEIGHT: 800,
	LOGIN_WIDTH: 420,
	LOGIN_HEIGHT: 580,
} as const;

/**
 * Local data persistence configurations
 */
export const DATA_CONFIG = {
	DEFAULT_DIR_NAME: ".aiworkstation",
} as const;

/**
 * Resolve absolute path from project root or resources directory
 */
export function resolveFromRoot(...parts: string[]): string {
	if (typeof app !== "undefined" && app?.isPackaged) {
		return path.join(process.resourcesPath, ...parts);
	}
	return path.resolve(__dirname, "..", ...parts);
}

/**
 * Resolve local user data directory
 */
export function resolveDataDir(): string {
	const homeDir =
		(typeof app !== "undefined" && app?.getPath ? app.getPath("home") : "") ||
		process.env.HOME ||
		"";
	const defaultDataDir = path.join(
		homeDir,
		DATA_CONFIG.DEFAULT_DIR_NAME,
	);
	return process.env.AIWORKSTATION_DATA_DIR?.trim() || defaultDataDir;
}

/**
 * Resolve preload script path
 */
export function resolvePreloadPath(): string {
	return path.join(__dirname, "preload.cjs");
}
