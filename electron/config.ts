import { app } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Runtime environment flag
 */
export const isDev = !app.isPackaged;

/**
 * Network and local server configurations
 */
export const SERVER_CONFIG = {
	HOST: "127.0.0.1",
	DEFAULT_PORT: 3888,
	STARTUP_TIMEOUT_MS: 15_000,
} as const;

/**
 * Project and repository links
 */
export const REPO_CONFIG = {
	OWNER: "chenxi2015",
	NAME: "aiworkstation",
	URL: "https://github.com/chenxi2015/aiworkstation",
	RELEASES_URL: "https://github.com/chenxi2015/aiworkstation/releases/latest",
} as const;

/**
 * Main window dimensional constraints
 */
export const WINDOW_CONFIG = {
	OPTIMAL_WIDTH: 1680,
	OPTIMAL_HEIGHT: 960,
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
	if (app.isPackaged) {
		return path.join(process.resourcesPath, ...parts);
	}
	return path.resolve(__dirname, "..", ...parts);
}

/**
 * Resolve local user data directory
 */
export function resolveDataDir(): string {
	const defaultDataDir = path.join(
		app.getPath("home"),
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
