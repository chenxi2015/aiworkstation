import { getCloudSession } from "../context/channels.ts";
import type { SearchOptions, SearchProvider, SearchResult } from "./types.ts";

/**
 * 官方通道联网搜索：调用云端网关 /api/ai/v1/search（会员权益能力）。
 * 凭证实时取自设置里的 cloudToken（登录即同步）。
 * 本地不判断会员状态——非会员/到期由云端返回 403，
 * 编排器按失败处理并继续级联后续引擎。
 */
export class CloudSearchProvider implements SearchProvider {
	name = "official";

	constructor(private timeoutMs: number) {}

	async search(
		query: string,
		options?: SearchOptions,
	): Promise<SearchResult[]> {
		const { cloudToken, cloudApiBase } = getCloudSession();
		if (!cloudToken) throw new Error("Not logged in to cloud account");

		const controller = new AbortController();
		const timeoutId = setTimeout(
			() => controller.abort(),
			options?.timeoutMs ?? this.timeoutMs,
		);
		try {
			const res = await fetch(`${cloudApiBase}/api/ai/v1/search`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${cloudToken}`,
				},
				body: JSON.stringify({ query, maxResults: options?.maxResults }),
				signal: controller.signal,
			});
			if (!res.ok) {
				throw new Error(`Cloud search HTTP ${res.status}`);
			}
			const json = (await res.json()) as {
				results?: Array<{
					title?: string;
					url?: string;
					snippet?: string;
					score?: number;
				}>;
			};
			return (json.results ?? [])
				.filter((r) => r?.url)
				.map((r) => ({
					title: r.title || r.url || "",
					url: r.url as string,
					snippet: r.snippet || "",
					score: r.score,
				}));
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
