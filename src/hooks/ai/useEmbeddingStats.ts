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

	const buildIndex = useCallback(async (customBatchSize?: number | unknown) => {
		// Ensure batchSize is strictly a number and not an event object (e.g. PressEvent from HeroUI Button onPress)
		const batchSize =
			typeof customBatchSize === "number" && customBatchSize > 0
				? Math.min(customBatchSize, 100)
				: 20;

		const settings = WorkbenchStorageService.getSettings();
		const embeddingKey = settings.embeddingApiKey?.trim();
		const deepseekKey = settings.deepseekApiKey?.trim();
		const apiKey = embeddingKey || deepseekKey;

		if (!apiKey) {
			toast.warning("请先在「设置」中配置 Embedding API Key 或 LLM API Key");
			return;
		}

		setIsIndexing(true);
		const config: { apiKey: string; baseUrl?: string; model?: string } = {
			apiKey,
		};
		if (settings.embeddingBaseUrl?.trim()) {
			config.baseUrl = settings.embeddingBaseUrl.trim();
		}
		if (settings.embeddingModel?.trim()) {
			config.model = settings.embeddingModel.trim();
		}

		try {
			let remaining = 1;
			let totalProcessed = 0;

			while (remaining > 0) {
				const res = await WorkbenchStorageService.batchProcessEmbeddings({
					config,
					batchSize,
				});

				if (res.error) {
					toast.danger(`构建向量索引失败: ${res.error}`);
					if (res.stats) {
						setStats(res.stats);
					}
					return;
				}

				totalProcessed += res.processed;
				remaining = res.remaining;
				if (res.stats) {
					setStats(res.stats);
				}

				if (res.processed === 0) break;
			}

			if (totalProcessed > 0) {
				toast.success(
					`向量索引构建完成！已新增向量化 ${totalProcessed} 条书签`,
				);
			} else {
				toast.success("所有书签向量索引均已是最新状态");
			}
		} catch (err: any) {
			console.error("[useEmbeddingStats] Build index error:", err);
			toast.danger(`构建向量索引失败: ${err?.message || err}`);
		} finally {
			setIsIndexing(false);
		}
	}, []);

	return {
		stats,
		isIndexing,
		fetchStats,
		buildIndex,
	};
}
