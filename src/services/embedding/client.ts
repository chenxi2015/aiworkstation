export const DEFAULT_EMBEDDING_BASE_URL = "https://api.siliconflow.cn/v1";
export const DEFAULT_EMBEDDING_MODEL = "BAAI/bge-m3";

export interface EmbeddingConfig {
	apiKey?: string;
	baseUrl?: string;
	model?: string;
}

/**
 * Compute embeddings for a batch of text strings via OpenAI-compatible endpoint
 */
export async function generateBatchEmbeddings(
	texts: string[],
	config: EmbeddingConfig,
	signal?: AbortSignal,
): Promise<number[][]> {
	if (texts.length === 0) return [];

	const baseUrl = (config.baseUrl || DEFAULT_EMBEDDING_BASE_URL).replace(
		/\/+$/,
		"",
	);
	const apiKey = config.apiKey || "";
	const model = config.model || DEFAULT_EMBEDDING_MODEL;

	const res = await fetch(`${baseUrl}/embeddings`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model,
			input: texts,
		}),
		signal,
	});

	if (!res.ok) {
		const errText = await res.text();
		let parsedMsg = errText;
		try {
			const errJson = JSON.parse(errText);
			parsedMsg = errJson.message || errJson.error?.message || errText;
		} catch {
			// Keep raw text if not JSON
		}

		if (res.status === 401) {
			throw new Error(
				`Embedding API 鉴权失败 (401 Unauthorized): ${parsedMsg}。请检查「设置」中的 Embedding API Key 是否有效。`,
			);
		}
		if (res.status === 404) {
			throw new Error(
				`Embedding API 接口不存在 (404 Not Found): ${parsedMsg}。请检查 Base URL 与模型名称是否正确。`,
			);
		}

		throw new Error(
			`Embedding API 错误 (${res.status} ${res.statusText}): ${parsedMsg}`,
		);
	}

	const data = await res.json();
	if (!data.data || !Array.isArray(data.data)) {
		throw new Error("Embedding API 返回格式异常，缺少 data 向量数组");
	}

	// Sort returned embeddings by index if present
	const sorted = [...data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
	return sorted.map((item) => item.embedding as number[]);
}

/**
 * Compute single embedding for a query string
 */
export async function generateQueryEmbedding(
	query: string,
	config: EmbeddingConfig,
	signal?: AbortSignal,
): Promise<number[] | null> {
	try {
		const [vec] = await generateBatchEmbeddings([query], config, signal);
		return vec || null;
	} catch (err) {
		console.warn("[EmbeddingClient] Failed to generate query embedding:", err);
		return null;
	}
}
