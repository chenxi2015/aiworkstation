import { createServerFn } from "@tanstack/react-start";

export interface FetchModelsParams {
	baseUrl: string;
	apiKey?: string;
}

export interface FetchModelsResult {
	success: boolean;
	models: string[];
	error?: string;
}

/**
 * Server Function: Fetch available models from an OpenAI-compatible / DeepSeek / Ollama endpoint
 */
export const getAvailableModels = createServerFn({ method: "POST" })
	.validator((data: FetchModelsParams) => data)
	.handler(async ({ data }): Promise<FetchModelsResult> => {
		const rawBaseUrl = data.baseUrl?.trim();
		if (!rawBaseUrl) {
			return {
				success: false,
				models: [],
				error: "Base URL is required to fetch models",
			};
		}

		const cleanBaseUrl = rawBaseUrl.replace(/\/+$/, "");
		const apiKey = data.apiKey?.trim();

		// Candidate endpoints to test based on OpenAI/Ollama specs
		const candidateUrls: string[] = [];
		if (cleanBaseUrl.endsWith("/v1")) {
			candidateUrls.push(`${cleanBaseUrl}/models`);
		} else {
			candidateUrls.push(`${cleanBaseUrl}/models`);
			candidateUrls.push(`${cleanBaseUrl}/v1/models`);
		}

		// Also try Ollama native endpoint if it looks like Ollama or localhost
		if (cleanBaseUrl.includes("11434") || cleanBaseUrl.includes("ollama")) {
			candidateUrls.push(`${cleanBaseUrl}/api/tags`);
		}

		const headers: Record<string, string> = {
			Accept: "application/json",
		};
		if (apiKey) {
			headers.Authorization = `Bearer ${apiKey}`;
		}

		let lastErrorMsg = "";

		for (const url of candidateUrls) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 8000);

				const res = await fetch(url, {
					method: "GET",
					headers,
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (!res.ok) {
					const errText = await res.text().catch(() => "");
					lastErrorMsg = `HTTP ${res.status}: ${errText.slice(0, 100) || res.statusText}`;
					continue;
				}

				const json = await res.json();
				const modelNames: string[] = [];

				// OpenAI / DeepSeek format: { data: [{ id: "model-name" }] }
				if (Array.isArray(json?.data)) {
					for (const item of json.data) {
						if (item && typeof item.id === "string") {
							modelNames.push(item.id);
						}
					}
				}
				// Ollama tags format: { models: [{ name: "model:tag" }] }
				else if (Array.isArray(json?.models)) {
					for (const item of json.models) {
						if (item && typeof item.name === "string") {
							modelNames.push(item.name);
						} else if (item && typeof item.model === "string") {
							modelNames.push(item.model);
						}
					}
				}
				// Array format: ["model1", "model2"] or [{ id: "model1" }]
				else if (Array.isArray(json)) {
					for (const item of json) {
						if (typeof item === "string") {
							modelNames.push(item);
						} else if (item && typeof item.id === "string") {
							modelNames.push(item.id);
						}
					}
				}

				if (modelNames.length > 0) {
					// Unique & natural sort
					const uniqueModels = Array.from(new Set(modelNames)).sort((a, b) =>
						a.localeCompare(b),
					);
					return {
						success: true,
						models: uniqueModels,
					};
				}
			} catch (err: unknown) {
				const error = err as { name?: string; message?: string };
				if (error.name === "AbortError") {
					lastErrorMsg = "Request timed out (8s)";
				} else {
					lastErrorMsg = error.message || "Network request failed";
				}
			}
		}

		return {
			success: false,
			models: [],
			error: lastErrorMsg || "No models found or endpoint not supported",
		};
	});
