import { toast } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
import type { EmbeddingStats } from "../../components/workbench/types";
import { WorkbenchStorageService } from "../../services/workbenchStorage";

export interface UseEmbeddingStatsReturn {
	stats: EmbeddingStats;
	isIndexing: boolean;
	fetchStats: () => Promise<EmbeddingStats>;
	buildIndex: (batchSize?: number) => Promise<void>;
}

interface EmbeddingRuntimeConfig {
	apiKey: string;
	baseUrl?: string;
	model?: string;
}

/**
 * Pure helper to extract active embedding API configuration from stored settings
 */
function resolveEmbeddingConfig(): EmbeddingRuntimeConfig | null {
	const settings = WorkbenchStorageService.getSettings();
	const embeddingKey = settings.embeddingApiKey?.trim();
	const llmKey = settings.apiKey?.trim();
	const apiKey = embeddingKey || llmKey;

	if (!apiKey) {
		return null;
	}

	const config: EmbeddingRuntimeConfig = { apiKey };
	if (settings.embeddingBaseUrl?.trim()) {
		config.baseUrl = settings.embeddingBaseUrl.trim();
	}
	if (settings.embeddingModel?.trim()) {
		config.model = settings.embeddingModel.trim();
	}
	return config;
}

/**
 * Pure helper to batch process all pending embeddings until finished
 */
async function executeBatchIndexing(
	config: EmbeddingRuntimeConfig,
	batchSize: number,
	onStatsUpdate: (stats: EmbeddingStats) => void,
): Promise<{ totalProcessed: number; error?: string }> {
	let remaining = 1;
	let totalProcessed = 0;

	while (remaining > 0) {
		const res = await WorkbenchStorageService.batchProcessEmbeddings({
			config,
			batchSize,
		});

		if (res.error) {
			if (res.stats) onStatsUpdate(res.stats);
			return { totalProcessed, error: res.error };
		}

		totalProcessed += res.processed;
		remaining = res.remaining;
		if (res.stats) onStatsUpdate(res.stats);

		if (res.processed === 0) break;
	}

	return { totalProcessed };
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
		const batchSize =
			typeof customBatchSize === "number" && customBatchSize > 0
				? Math.min(customBatchSize, 100)
				: 20;

		const config = resolveEmbeddingConfig();
		if (!config) {
			toast.warning("请先在「设置」中配置 Embedding API Key 或 LLM API Key");
			return;
		}

		setIsIndexing(true);
		try {
			const { totalProcessed, error } = await executeBatchIndexing(
				config,
				batchSize,
				setStats,
			);

			if (error) {
				toast.danger(`构建向量索引失败: ${error}`);
				return;
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
