import type { EmbeddingConfig } from "../../../services/embeddingService.ts";
import { workbenchDb } from "../../db/sqlite.ts";
import {
	getActiveChannel,
	listChannelConfigs,
	resolveCapabilityConfig,
} from "./channels.ts";

export interface LlmConfigOverrides {
	apiKey?: string;
	baseUrl?: string;
	model?: string;
}

/**
 * Resolve effective LLM config on the server.
 * 配置事实源为 ai_channel_configs 表（见 channels.ts）：
 * 官方通道走云端网关 + cloudToken；自备通道用行内 apiKey/baseUrl。
 * 不再做任何 env 兜底（docs/ai-config-membership-v2-plan.md）。
 */
export function resolveLlmConfig(overrides: LlmConfigOverrides = {}): {
	apiKey: string;
	baseUrl: string;
	model: string;
} {
	const resolved = resolveCapabilityConfig("chat", overrides);
	return {
		apiKey: resolved.apiKey,
		baseUrl: resolved.baseUrl,
		model: resolved.model,
	};
}

/** Whether the current LLM provider is the official managed channel */
export function isOfficialLlmProvider(): boolean {
	return getActiveChannel("chat")?.channel === "official";
}

/**
 * Resolve effective embedding config on the server.
 * Priority: caller overrides > ai_channel_configs 活跃行。
 */
export function resolveEmbeddingConfig(
	overrides: EmbeddingConfig = {},
): EmbeddingConfig {
	const resolved = resolveCapabilityConfig("embedding", overrides);
	const customFallback =
		resolved.channel === "official"
			? listChannelConfigs("embedding").find(
					(r) => r.channel === "custom" && r.apiKey.trim(),
				)
			: undefined;
	return {
		apiKey: resolved.apiKey,
		baseUrl: resolved.baseUrl,
		model: resolved.model,
		fallbackApiKey: customFallback?.apiKey.trim(),
		fallbackBaseUrl: customFallback?.baseUrl.trim(),
		fallbackModel: customFallback?.model.trim(),
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
 * skillPath 属于创作偏好而非通道配置，仍从 workbench_settings 读取。
 */
export function resolveImageGenConfig(
	overrides: Partial<ImageGenConfig> = {},
): ImageGenConfig {
	const resolved = resolveCapabilityConfig("image_gen", overrides);

	let skillPath = overrides.skillPath?.trim() ?? "";
	if (!skillPath) {
		try {
			const raw = workbenchDb.getSetting("workbench_settings");
			if (raw) {
				skillPath = String(
					(JSON.parse(raw) as { imageSkillPath?: string }).imageSkillPath ??
						"",
				).trim();
			}
		} catch {
			skillPath = "";
		}
	}

	return {
		apiKey: resolved.apiKey,
		baseUrl: resolved.baseUrl,
		model: resolved.model,
		provider: resolved.provider,
		skillPath,
	};
}
