export interface ProviderPreset {
	id: string;
	name: string;
	baseUrl: string;
	models: string[];
}

export const LLM_PROVIDERS: ProviderPreset[] = [
	{
		id: "deepseek",
		name: "DeepSeek",
		baseUrl: "https://api.deepseek.com",
		models: ["deepseek-chat", "deepseek-reasoner"],
	},
	{
		id: "kimi",
		name: "Kimi（月之暗面）",
		baseUrl: "https://api.moonshot.cn/v1",
		models: [
			"kimi-k2-0905-preview",
			"kimi-latest",
			"moonshot-v1-8k",
			"moonshot-v1-32k",
			"moonshot-v1-128k",
		],
	},
	{
		id: "glm",
		name: "智谱 GLM",
		baseUrl: "https://open.bigmodel.cn/api/paas/v4",
		models: ["glm-4.5", "glm-4-plus", "glm-4-air", "glm-4-flash"],
	},
	{
		id: "openai",
		name: "OpenAI",
		baseUrl: "https://api.openai.com/v1",
		models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
	},
	{
		id: "claude",
		name: "Claude（Anthropic）",
		baseUrl: "https://api.anthropic.com/v1",
		models: [
			"claude-sonnet-4-5",
			"claude-3-7-sonnet-20250224",
			"claude-3-5-sonnet-20241022",
		],
	},
	{ id: "custom", name: "自定义（OpenAI 兼容接口）", baseUrl: "", models: [] },
];

export const EMBEDDING_PROVIDERS: ProviderPreset[] = [
	{
		id: "siliconflow",
		name: "SiliconFlow",
		baseUrl: "https://api.siliconflow.cn/v1",
		models: ["BAAI/bge-m3", "BAAI/bge-large-zh-v1.5", "BAAI/bge-large-en-v1.5"],
	},
	{
		id: "openai",
		name: "OpenAI",
		baseUrl: "https://api.openai.com/v1",
		models: ["text-embedding-3-small", "text-embedding-3-large"],
	},
	{
		id: "custom",
		name: "自定义（Ollama / 其他兼容接口）",
		baseUrl: "",
		models: [],
	},
];

export const FALLBACK_LLM_MODELS = LLM_PROVIDERS.flatMap((p) => p.models);
export const FALLBACK_EMBEDDING_MODELS = EMBEDDING_PROVIDERS.flatMap(
	(p) => p.models,
);

export function inferProviderId(
	baseUrl: string | undefined,
	presets: ProviderPreset[],
): string {
	if (!baseUrl) return "custom";
	const normalized = baseUrl.trim().replace(/\/+$/, "");
	const matched = presets.find(
		(p) => p.baseUrl && p.baseUrl.replace(/\/+$/, "") === normalized,
	);
	return matched?.id ?? "custom";
}
