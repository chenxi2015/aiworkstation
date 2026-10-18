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

export interface ImageGenConfig {
	apiKey: string;
	baseUrl: string;
	model: string;
	provider: string;
	skillPath?: string;
}

/**
 * Resolve effective image generation config on the server.
 */
export function resolveImageGenConfig(
	overrides: Partial<ImageGenConfig> = {},
): ImageGenConfig {
	const db = readDbSettings();
	const provider = overrides.provider || db?.imageProvider || "doubao";
	const apiKey =
		overrides.apiKey?.trim() ||
		db?.imageApiKey?.trim() ||
		db?.apiKey?.trim() ||
		"";

	let defaultBaseUrl = "https://ark.cn-beijing.volces.com/api/v3";
	if (provider === "openai") defaultBaseUrl = "https://api.openai.com/v1";
	else if (provider === "siliconflow")
		defaultBaseUrl = "https://api.siliconflow.cn/v1";
	else if (provider === "nanobanana")
		defaultBaseUrl = "https://generativelanguage.googleapis.com/v1beta";

	const baseUrl = (
		overrides.baseUrl?.trim() ||
		db?.imageBaseUrl?.trim() ||
		defaultBaseUrl
	).replace(/\/+$/, "");

	let fallbackModel = "doubao-seedream-5-0-flash-260915";
	if (provider === "openai") fallbackModel = "gpt-image-2";
	else if (provider === "nanobanana") fallbackModel = "nano-banana-2";
	else if (provider === "siliconflow")
		fallbackModel = "black-forest-labs/FLUX.1-schnell";

	const model =
		overrides.model?.trim() ||
		db?.imageModel?.trim() ||
		fallbackModel;

	const skillPath =
		overrides.skillPath?.trim() || db?.imageSkillPath?.trim() || "";
	return { apiKey, baseUrl, model, provider, skillPath };
}
