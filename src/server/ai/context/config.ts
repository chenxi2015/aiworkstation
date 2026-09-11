import type { WorkbenchSettings } from "../../../components/workbench/types.ts";
import type { EmbeddingConfig } from "../../../services/embeddingService.ts";
import { workbenchDb } from "../../db/sqlite.ts";

export interface LlmConfigOverrides {
	apiKey?: string;
	baseUrl?: string;
	model?: string;
}

/** Read and parse WorkbenchSettings from SQLite once, with safe fallback */
function readDbSettings(): Partial<WorkbenchSettings> | null {
	try {
		const raw = workbenchDb.getSetting("workbench_settings");
		if (raw) return JSON.parse(raw) as Partial<WorkbenchSettings>;
	} catch (err) {
		console.warn("[context/config] Failed to parse settings from SQLite:", err);
	}
	return null;
}

/**
 * Resolve effective LLM config on the server.
 * Priority: caller overrides > settings stored in SQLite > hardcoded defaults.
 */
export function resolveLlmConfig(overrides: LlmConfigOverrides = {}): {
	apiKey: string;
	baseUrl: string;
	model: string;
} {
	const db = readDbSettings();
	const apiKey = overrides.apiKey?.trim() || db?.apiKey?.trim() || "";
	const baseUrl = (
		overrides.baseUrl?.trim() ||
		db?.baseUrl?.trim() ||
		"https://api.deepseek.com"
	).replace(/\/+$/, "");
	const model = overrides.model?.trim() || db?.model?.trim() || "deepseek-chat";
	return { apiKey, baseUrl, model };
}

/**
 * Resolve effective embedding config on the server.
 * Priority: caller overrides > settings stored in SQLite (embedding key falls back to LLM key).
 */
export function resolveEmbeddingConfig(
	overrides: EmbeddingConfig = {},
): EmbeddingConfig {
	if (overrides.apiKey?.trim()) return overrides;
	const db = readDbSettings();
	if (!db) return overrides;
	return {
		apiKey: db.embeddingApiKey?.trim() || db.apiKey?.trim() || "",
		baseUrl: overrides.baseUrl || db.embeddingBaseUrl,
		model: overrides.model || db.embeddingModel,
	};
}
