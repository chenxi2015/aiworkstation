import { Button, Tooltip } from "@heroui/react";
import { Database, Loader2, Zap } from "lucide-react";
import { memo } from "react";
import type { EmbeddingStats } from "../../types";

export interface EmbeddingStatusWidgetProps {
	stats?: EmbeddingStats | null;
	isIndexing: boolean;
	onBuildIndex: () => void;
	compact?: boolean;
	className?: string;
}

/**
 * Shared widget displaying embedding coverage percentage and vector index rebuild trigger
 */
export const EmbeddingStatusWidget = memo(function EmbeddingStatusWidget({
	stats,
	isIndexing,
	onBuildIndex,
	compact = true,
	className = "",
}: EmbeddingStatusWidgetProps) {
	// Guard against undefined or uninitialized stats
	const safeStats = stats || { total: 0, embedded: 0, percentage: 0 };
	const percentage = typeof safeStats.percentage === "number" ? safeStats.percentage : 0;
	const isFull = percentage >= 100;
	const embedded = safeStats.embedded ?? 0;
	const total = safeStats.total ?? 0;

	return (
		<div
			className={`flex items-center gap-2 bg-surface-secondary/60 rounded-xl px-2.5 py-1.5 border border-border/60 ${className}`}
		>
			<div className="flex items-center gap-1.5 text-[11px] text-muted flex-1 min-w-0">
				<Database className="w-3.5 h-3.5 text-accent shrink-0" />
				<span className="truncate">
					{compact ? "向量索引" : "RAG 向量索引覆盖率"}:
				</span>
				<span className="font-semibold text-foreground">
					{percentage}%
				</span>
				<span className="text-[10px] text-muted/80">
					({embedded}/{total})
				</span>
			</div>

			{/* Progress Mini Bar */}
			<div className="w-12 h-1.5 rounded-full bg-border overflow-hidden shrink-0">
				<div
					className={`h-full transition-all duration-300 ${
						isFull ? "bg-emerald-500" : "bg-accent"
					}`}
					style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
				/>
			</div>

			{/* Indexing / Trigger Button */}
			<Tooltip>
				<Tooltip.Trigger>
					<Button
						variant="ghost"
						size="sm"
						className="h-6 px-2 text-[10px] font-medium text-accent hover:bg-accent-soft rounded-lg cursor-pointer flex items-center gap-1 shrink-0"
						onPress={() => onBuildIndex()}
						isDisabled={isIndexing}
					>
						{isIndexing ? (
							<>
								<Loader2 className="w-3 h-3 animate-spin text-accent" />
								<span>构建中...</span>
							</>
						) : (
							<>
								<Zap className="w-3 h-3 text-accent" />
								<span>{isFull ? "更新索引" : "构建索引"}</span>
							</>
						)}
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content className="text-xs py-1 px-2 max-w-xs">
					调用 Embedding 模型批量生成向量嵌入，以支持高质量语义混合检索
				</Tooltip.Content>
			</Tooltip>
		</div>
	);
});
