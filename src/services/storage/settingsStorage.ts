import type { WorkbenchSettings } from "../../components/workbench/types";
import {
	getWorkbenchSettings,
	saveWorkbenchSettings,
} from "../../server/functions/workbench";
import {
	DEFAULT_LLM_BASE_URL,
	DEFAULT_LLM_KEY,
	DEFAULT_LLM_MODEL,
} from "../classifier/taxonomy";
import {
	DEFAULT_EMBEDDING_BASE_URL,
	DEFAULT_EMBEDDING_MODEL,
} from "../embedding/client";

export const STORAGE_KEY_SETTINGS = "aiworkstation_settings_v3";

export const DEFAULT_SETTINGS: WorkbenchSettings = {
	apiKey: DEFAULT_LLM_KEY,
	baseUrl: DEFAULT_LLM_BASE_URL,
	model: DEFAULT_LLM_MODEL,
	batchSize: 15,
	llmProvider: "deepseek",
	embeddingApiKey: "",
	embeddingBaseUrl: DEFAULT_EMBEDDING_BASE_URL,
	embeddingModel: DEFAULT_EMBEDDING_MODEL,
	embeddingProvider: "siliconflow",
};

export interface EffectiveLLMConfig {
	apiKey: string;
	baseUrl: string;
	model: string;
	provider: string;
}

/**
 * Extracts normalized, provider-agnostic LLM configuration from settings
 */
export function getEffectiveLLMConfig(
	settings?: Partial<WorkbenchSettings>,
): EffectiveLLMConfig {
	const raw = (settings || {}) as Record<string, unknown>;
	const apiKey = String(raw.apiKey || DEFAULT_LLM_KEY).trim();
	const baseUrl = String(raw.baseUrl || DEFAULT_LLM_BASE_URL)
		.trim()
		.replace(/\/+$/, "");
	const model = String(raw.model || DEFAULT_LLM_MODEL).trim();
	const provider = String(raw.llmProvider || "deepseek").trim();

	return { apiKey, baseUrl, model, provider };
}

/**
 * Load settings from browser localStorage
 */
export function getSettings(): WorkbenchSettings {
	if (typeof window === "undefined") return DEFAULT_SETTINGS;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY_SETTINGS);
		if (raw) {
			const parsed = JSON.parse(raw);
			return {
				...DEFAULT_SETTINGS,
				...parsed,
				apiKey: parsed.apiKey || DEFAULT_SETTINGS.apiKey,
				baseUrl: parsed.baseUrl || DEFAULT_SETTINGS.baseUrl,
				model: parsed.model || DEFAULT_SETTINGS.model,
			};
		}
	} catch (err) {
		console.error("Failed to load settings from localStorage:", err);
	}
	return DEFAULT_SETTINGS;
}

/**
 * Fetch settings from SQLite database and sync to localStorage cache
 */
export async function fetchSettingsFromDb(): Promise<WorkbenchSettings> {
	try {
		const dbSettings = await getWorkbenchSettings();
		if (dbSettings) {
			const merged: WorkbenchSettings = {
				...DEFAULT_SETTINGS,
				...dbSettings,
				apiKey: String(dbSettings.apiKey || "").trim(),
				baseUrl: String(dbSettings.baseUrl || DEFAULT_LLM_BASE_URL).trim(),
				model: String(dbSettings.model || DEFAULT_LLM_MODEL).trim(),
			};

			if (typeof window !== "undefined") {
				window.localStorage.setItem(
					STORAGE_KEY_SETTINGS,
					JSON.stringify(merged),
				);
			}
			return merged;
		}
	} catch (err) {
		console.warn("[settingsStorage] fetchSettingsFromDb error:", err);
	}
	return getSettings();
}

/**
 * Persist settings to both localStorage and SQLite database asynchronously
 */
export function saveSettings(settings: WorkbenchSettings): void {
	if (typeof window === "undefined") return;

	const normalized: WorkbenchSettings = {
		...settings,
		apiKey: (settings.apiKey || "").trim(),
		baseUrl: (settings.baseUrl || DEFAULT_LLM_BASE_URL).trim(),
		model: (settings.model || DEFAULT_LLM_MODEL).trim(),
	};

	try {
		window.localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(normalized));
	} catch (err) {
		console.error("Failed to save settings to localStorage:", err);
	}

	// Asynchronously persist to SQLite DB
	saveWorkbenchSettings({ data: normalized }).catch((err) => {
		console.warn(
			"[settingsStorage] saveWorkbenchSettings to SQLite error:",
			err,
		);
	});
}
