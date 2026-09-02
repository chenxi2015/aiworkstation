import { useCallback, useEffect, useState } from "react";
import { toast } from "@heroui/react";
import { WorkbenchStorageService } from "../../services/workbenchStorage";
import type { EmbeddingStats } from "../../components/workbench/types";

export interface UseEmbeddingStatsReturn {
	stats: EmbeddingStats;
	isIndexing: boolean;
	fetchStats: () => Promise<EmbeddingStats>;
	buildIndex: (batchSize?: number) => Promise<void>;
}

/**
 * Custom hook to monitor vector embedding coverage and trigger index rebuilding
 */
export function useEmbeddingStats(autoFetch = true): UseEmbeddingStatsReturn {
	const [stats, setStats] = useState<EmbeddingStats>({
		total: 0,
		embedded: 0,
		percentage: 0,
	});
	const [isIndexing, setIsIndexing] = useState<boolean>(false);

	const fetchStats = useCallback(async () => {
		try {
			const data = await WorkbenchStorageService.getEmbeddingStats();
			setStats(data);
			return data;
		} catch (err) {
			console.error("[useEmbeddingStats] Failed to fetch stats:", err);
			return { total: 0, embedded: 0, percentage: 0 };
		}
	}, []);

	useEffect(() => {
		if (autoFetch) {
			fetchStats();
		}
	}, [autoFetch, fetchStats]);

	const buildIndex = useCallback(
		async (batchSize = 20) => {
			const settings = WorkbenchStorageService.getSettings();
			const apiKey = settings.embeddingApiKey || settings.deepseekApiKey;

			if (!apiKey) {
				toast.warning("请先在「设置」中配置 Embedding API Key 或 DeepSeek API Key");
				return;
			}

			setIsIndexing(true);
			const config = {
				apiKey: apiKey.trim(),
				baseUrl: settings.embeddingBaseUrl?.trim() || undefined,
				model: settings.embeddingModel?.trim() || undefined,
			};

			try {
				let remaining = 1;
				let totalProcessed = 0;

				while (remaining > 0) {
					const res = await WorkbenchStorageService.batchProcessEmbeddings({
						config,
						batchSize,
					});
					totalProcessed += res.processed;
					remaining = res.remaining;
					setStats(res.stats);

					if (res.processed === 0) break;
				}

				toast.success(`向量索引构建完成！已向量化 ${totalProcessed} 条书签`);
			} catch (err: any) {
				console.error("[useEmbeddingStats] Build index error:", err);
				toast.danger(`构建向量索引失败: ${err.message || err}`);
			} finally {
				setIsIndexing(false);
			}
		},
		[],
	);

	return {
		stats,
		isIndexing,
		fetchStats,
		buildIndex,
	};
}
